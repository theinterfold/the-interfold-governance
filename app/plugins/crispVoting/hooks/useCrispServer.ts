import { voteEvidence, type VoteScope } from "../utils/voteEvidence";
import { ballotWeightPercentage, chooseBallotWeight, reviewedVote, type BallotWeight } from "../utils/ballotWeight";
import { PUB_CHAIN, PUB_CRISP_SERVER_URL, PUB_VOTING_ON_AZTEC, PUB_VOTING_POWER_SOURCE } from "@/constants";
import { usePrivatePair } from "./usePrivatePair";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import { CreditsMode } from "../utils/types";
import type { EligibleVoter, IRoundDetailsResponse, VoteData, VotingStep } from "../utils/types";
import { encodeSolidityProof, finishBallotProof, finishMaskProof, getZeroVote } from "@crisp-e3/sdk";
import type { ProofProgress } from "@crisp-e3/sdk";
import { ensureCircuits } from "../utils/circuits";
import type { ProofProgressState } from "../utils/proofProgress";
import { iVotesAbi } from "../artifacts/iVotes";
import { parseAbi, size, type Address, type Hex } from "viem";
import { publicClient } from "../utils/client";
import { useAlerts } from "@/context/Alerts";
import { crispSdk } from "../utils/crispSdk";
import { getRandomVoterToMask } from "../utils/voters";
import { equalAddresses } from "@/utils/evm";
import { describeFailure } from "../utils/describeFailure";
import { decodeTxError } from "@/utils/tx-errors";
import { snapshotReadBlock } from "../utils/snapshotReadBlock";
import {
  CensusMode,
  ballotSignatureRequest,
  getBallotDigest,
  getCensusMode,
  getOnchainVotingPower,
  getRoundNumOptions,
  getRoundSnapshot,
  getVotingPowerDivisor,
  resolveCrispProgram,
} from "../utils/ballotDigest";
import { usePublishVote } from "./usePublishVote";
import { useCommitteeKeyCheck } from "./useCommitteeKeyCheck";
import { decideCommitmentStep, waitForCommitmentDecision, type VoteResponse } from "../utils/commitmentDecision";
import type { BallotSubmissionResult, PreparedVoteReceipt } from "../utils/ballotSubmission";
import { usePreparedBallot } from "./usePreparedBallot";
import {
  buildPreparedBallot,
  preparedSenderError,
  readPreparedBallot,
  type PreparedBallot,
} from "../utils/preparedBallot";
import { sendPreparedBallot } from "../utils/sendPreparedBallot";
import {
  broadcastSubmission,
  canDiscardRejectedRetry,
  pendingSubmissions,
  readSubmission,
  submissionJobId,
  type PendingSubmission,
  type SubmissionRecoveryState,
} from "../utils/pendingSubmission";
import { assertAztecRoundOpen } from "../utils/aztec/round";
import type { SignKind } from "../utils/aztec/castBallot";

/** How long a signature request waits before the card says where to look for it. */
const SIGNATURE_WAIT_HINT_MS = 30_000;

/** The plugin is authoritative about which token carries voting power. */
const votingTokenAbi = parseAbi(["function getVotingToken() view returns (address)"]);

/**
 * Converts the server's `committee_public_key` to bytes, or `undefined` if it is not the byte array
 * the type claims.
 *
 * `getRoundStateLite` only CASTS the parsed JSON, so the declared `number[]` is a promise the server
 * is not held to. `new Uint8Array("...")` on a string yields an empty array rather than throwing,
 * and an array of non-numbers yields zeros — either way the caller would go on to treat junk as a
 * key. Returning `undefined` instead lets the resolver report "no server key" honestly.
 */
function toKeyBytes(value: unknown): Uint8Array | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const valid = value.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255);
  if (!valid) return undefined;

  return Uint8Array.from(value as number[]);
}

/** What `resolveVoteBalance` reads of a round's state: its credit mode, and its start for a snapshot without a program. */
type RoundCredits = Pick<IRoundDetailsResponse, "credit_mode" | "credits" | "start_time">;

/**
 * A votes round on Aztec always weighs ballots by token power (`CUSTOM` credits) and reads its snapshot from the program,
 * so no server state is read for it (`start_time` is never used on that branch).
 */
const AZTEC_ROUND_CREDITS: RoundCredits = { credit_mode: CreditsMode.CUSTOM, credits: null, start_time: "0" };

async function resolveVoteBalance(
  body: `0x${string}`,
  e3Id: bigint,
  address: string,
  roundState: RoundCredits,
  crispProgram?: `0x${string}`
) {
  // Ask the plugin which token carries voting power rather than trusting an env constant:
  // this must match the server's census and the tally exactly, or the voter's leaf will not
  // match the server's merkle tree. Falls back to the configured source if the read fails.
  const votingToken = ((await publicClient
    .readContract({
      address: body,
      abi: votingTokenAbi,
      functionName: "getVotingToken",
    })
    .catch(() => undefined)) ?? PUB_VOTING_POWER_SOURCE) as `0x${string}`;
  const decimals = await publicClient.readContract({
    address: votingToken,
    abi: iVotesAbi,
    functionName: "decimals",
  });
  const constant = roundState.credit_mode === CreditsMode.CONSTANT;
  // Raw token units in one ballot unit: the divisor the CRISP program recorded for the round, never
  // derived from the token's decimals. The verifier scales by exactly this number.
  const unit = constant ? 1n : await getVotingPowerDivisor(publicClient, body, e3Id);
  if (unit === 0n) throw new Error("The CRISP program records no voting-power divisor for this round.");

  let adjustedBalance: bigint;
  // The full power, in raw token units. Only the review uses it: the share compares the counted
  // tokens with it, so the remainder that whole ballot units leave out shows too.
  let power: bigint;

  if (crispProgram) {
    // An ONCHAIN round takes both the snapshot and the scaling from the contract, which then
    // verifies the proof against exactly that number. Reading it here — rather than repeating
    // the `getPastVotes` call and the division below — is what keeps the
    // prover and the verifier in agreement; a one-unit difference fails the proof with nothing
    // naming the cause.
    adjustedBalance = await getOnchainVotingPower(publicClient, crispProgram, e3Id, address as `0x${string}`);
    if (constant) {
      power = adjustedBalance;
    } else {
      // The amount that `votingPowerOf` divides: the voting token at the snapshot of the round.
      power = await publicClient.readContract({
        address: votingToken,
        abi: iVotesAbi,
        functionName: "getPastVotes",
        args: [address as `0x${string}`, await getRoundSnapshot(publicClient, crispProgram, e3Id)],
      });
      // Both reads use the chain head, so they disagree only when the power changed between them.
      if (power / unit !== adjustedBalance)
        throw new Error("Your voting power changed while the app read it. Try again.");
    }
  } else if (constant && roundState.credits) {
    adjustedBalance = BigInt(roundState.credits);
    power = adjustedBalance;
  } else {
    // The voting token is timestamp-clocked (EIP-6372, CLOCK_MODE=timestamp), so
    // getPastVotes expects a *timestamp*, not a block number. The CRISP server snapshots
    // voting power at `start_time - 1`; we must query the exact same point or our leaf
    // won't match the server's merkle tree.
    const snapshotTimestamp = BigInt(roundState.start_time) - 1n;

    // The block the snapshot timepoint falls in. `getBlockAtTimestamp` returns the block at or
    // *before* the timepoint, whose own timestamp can precede it — reading there reverts with
    // `ERC5805FutureLookup`, so take the next block.
    const snapshotBlock = await crispSdk
      .getBlockAtTimestamp(snapshotTimestamp)
      .then((r) => snapshotReadBlock(BigInt(r.blockNumber), BigInt(r.timestamp), snapshotTimestamp))
      .catch(() => undefined);

    const balance = await publicClient.readContract({
      address: votingToken,
      abi: iVotesAbi,
      functionName: "getPastVotes",
      args: [address as `0x${string}`, snapshotTimestamp],
      // Evaluated at the snapshot block, not at chain head. `BondedVotes.getPastVotes` mixes a
      // checkpointed history with a live `_lockedVotes` walk, so the same timepoint answers
      // differently once the voter's locks change — and a leaf built from today's answer would
      // not match the tree the server built at the snapshot.
      ...(snapshotBlock !== undefined ? { blockNumber: snapshotBlock } : {}),
    });

    // Must mirror the CRISP server's scaling exactly (the round's recorded divisor) or our vote
    // won't match the server's merkle leaf. The divisor also keeps every option total below the
    // BFV plaintext modulus.
    adjustedBalance = balance / unit;
    power = balance;
  }

  return {
    available: adjustedBalance,
    power,
    unit,
    decimals: constant ? 0 : decimals,
  };
}

/**
 * State of the Crisp server
 */
interface CrispServerState {
  /** Draws the weight that a ballot counts, for the voter to review before signing. */
  getVoteWeight: (randomize: boolean, percentage?: number) => Promise<BallotWeight>;
  isLoading: boolean;
  error: string;
  postVote: (
    voteOption: bigint,
    e3Id: bigint,
    snapshotBlock: bigint,
    isAMask?: boolean,
    /** Send the vote yourself instead of handing it to the CRISP server to relay. */
    submitOnChain?: boolean,
    options?: PostVoteOptions
  ) => Promise<BallotSubmissionResult>;
  votingStep: VotingStep;
  lastActiveStep: VotingStep | null;
  stepMessage: string;
  /** The ballot proof's stages so far, while one is being generated. */
  proofProgress: ProofProgressState | null;
  txHash: string | null;
  /** The round currently satisfies every precondition `publishInput` enforces. */
  canPublishOnChain: boolean;
  /** Why the on-chain route is unavailable, when it is. */
  onChainBlockedReason?: string;
  /** The ballot that this browser holds for another wallet to send, or `null`. */
  preparedBallot: PreparedBallot | null;
  /** The vote that a different wallet sent, until the voter chooses to change it. */
  preparedReceipt: PreparedVoteReceipt | null;
  changePreparedVote: () => void;
  /** Sign, stage and save a vote without sending it. Another wallet sends it with `sendPreparedVote`. */
  prepareVote: (voteOption: bigint, snapshotBlock: bigint, weight: BallotWeight) => Promise<BallotSubmissionResult>;
  /** Send `preparedBallot` from the connected wallet, which must not be the one that signed it. */
  sendPreparedVote: () => Promise<BallotSubmissionResult>;
  discardPreparedVote: () => void;
  /** An unfinished request replaces the ballot form until its exact submission is resolved. */
  submissionRecovery: {
    kind: "vote" | "mask";
    state: SubmissionRecoveryState;
    busy: boolean;
    message?: string;
    canDiscard: boolean;
  } | null;
  recoverSubmission: () => Promise<void>;
  discardSubmission: () => void;
}

interface PostVoteOptions {
  /** Mask this slot instead of a random eligible voter's. Ignored for a real vote. */
  maskTarget?: Address;
  /** The reviewed weight that a vote counts. Required for a vote, ignored for a mask. */
  weight?: BallotWeight;
  /**
   * Stage the ballot for the wallet to send, but do not send it. The signed, attested payload is
   * saved in this browser for `sendPreparedVote`. Only a vote can be deferred, never a mask.
   */
  deferSend?: boolean;
}

/**
 * Request body for broadcasting a vote to the CRISP server
 */
export interface BroadcastVoteRequest {
  /// Decimal string, not a number. E3 ids are namespaced by the Interfold address — the low 96
  /// bits are the counter, the high 160 the contract — so they are ~1e76 and lose precision as a
  /// JS number, reaching the server in exponential form. The server parses base-10 and answers
  /// 400 with a message the UI never surfaces.
  round_id: string;
  encoded_proof: string;
  /**
   * The slot that the ballot writes to: the connected wallet for a vote, the target slot for a mask.
   * The encoded proof already contains this slot, so the field gives the server no new data. Never
   * send the connected wallet for a mask: the server could then link the masker to the slot.
   */
  address: string;
  /**
   * Ask the server to hand the attested payload to this wallet instead of relaying the ballot.
   * The server then sends nothing for this ballot and uses none of its relay allowance.
   */
  send_from_wallet: boolean;
}

/**
 * Hook to interact with Crisp server
 * @returns an error, a loading state and a function to cast votes
 */
export function useCrispServer(e3Id?: bigint): CrispServerState {
  const { address, chainId: walletChainId, connector } = useAccount();
  const { body } = usePrivatePair();
  const { switchChainAsync } = useSwitchChain();
  const { addAlert } = useAlerts();

  // The on-chain route needs the round up front to check `publishInput`'s preconditions, so the
  // caller passes it here rather than only at vote time.
  const {
    publish: publishVoteOnChain,
    canPublish: canPublishOnChain,
    blockedReason: onChainBlockedReason,
    commitmentDeadline,
  } = usePublishVote(PUB_VOTING_ON_AZTEC ? undefined : e3Id);

  const resolveCommitteeKey = useCommitteeKeyCheck(e3Id);

  // A ballot that this browser signed and staged, for a different wallet to send. It is keyed by
  // chain, plugin and round, not by wallet, so it survives the wallet switch.
  const pending = usePreparedBallot(
    e3Id === undefined ? undefined : { chainId: PUB_CHAIN.id, plugin: body, roundId: e3Id.toString() }
  );
  const [preparedReceipt, setPreparedReceipt] = useState<PreparedVoteReceipt | null>(null);
  useEffect(() => {
    setPreparedReceipt(null);
  }, [e3Id]);
  const sendingPrepared = useRef(false);

  const [votingStep, setVotingStep] = useState<VotingStep>("idle");
  const [lastActiveStep, setLastActiveStep] = useState<VotingStep | null>(null);
  const [stepMessage, setStepMessage] = useState<string>("");
  const [proofProgress, setProofProgress] = useState<ProofProgressState | null>(null);

  const { signTypedDataAsync } = useSignTypedData();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const submissionScope =
    e3Id === undefined || !address
      ? undefined
      : {
          chainId: PUB_CHAIN.id,
          plugin: body,
          roundId: e3Id,
          voter: address,
        };
  const storedSubmission = useSyncExternalStore(
    pendingSubmissions.subscribe,
    () => {
      if (!submissionScope) return undefined;
      try {
        return pendingSubmissions.get(submissionScope);
      } catch {
        return "The saved submission cannot be read. Check again, or clear its saved data to return to the ballot.";
      }
    },
    () => undefined
  );
  const activeSubmission = useRef<PendingSubmission | null>(null);
  const recovering =
    typeof storedSubmission === "object" && activeSubmission.current !== storedSubmission
      ? storedSubmission
      : undefined;
  const [recoveryState, setRecoveryState] = useState<SubmissionRecoveryState>("checking");
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const recoveryRunning = useRef(false);

  // A wallet prompt must not open from a page that the voter already left. The worker can take
  // minutes to choose who sends a ballot, so the wait can outlive the page.
  const active = useRef(true);
  // This hook survives wallet changes, unlike the ballot card. Invalidate work immediately so
  // an older encryption/proof cannot open a prompt or send from the newly connected account.
  const operationScope = useRef({ address, e3Id, body });
  if (
    operationScope.current.address !== address ||
    operationScope.current.e3Id !== e3Id ||
    operationScope.current.body !== body
  ) {
    operationScope.current = { address, e3Id, body };
  }
  useEffect(() => {
    // An already-started prepared send owns its own lifecycle across account changes.
    setIsLoading(sendingPrepared.current);
    setError("");
    setTxHash(null);
    setVotingStep("idle");
    setLastActiveStep(null);
    setStepMessage("");
    setProofProgress(null);
    setRecoveryBusy(false);
    setRecoveryMessage(undefined);
  }, [address, e3Id, body]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  /** Read one staged ballot's job: its view, `null` when the server does not know it, else `undefined`. */
  const readCommitmentView = (jobId: string) => readSubmission(PUB_CRISP_SERVER_URL, jobId);

  const rememberSubmission = (scope: VoteScope, submission: PendingSubmission, hash: string | null) => {
    const walletHash = pendingSubmissions.get(scope)?.transactionHash;
    // readPendingSubmission returns a wallet hash only after reading its successful receipt.
    voteEvidence.record(
      scope,
      walletHash && walletHash === hash ? "confirmed" : "submitted",
      submission.kind === "mask",
      hash
    );
    pendingSubmissions.remove(scope, submission);
  };

  // A wallet may have broadcast before its receipt RPC failed. Once a hash exists, only read
  // that transaction: a server that has not indexed it yet must not open another wallet prompt.
  const readPendingSubmission = async (scope: VoteScope, submission: PendingSubmission) => {
    if (submission.transactionHash) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: submission.transactionHash });
        if (receipt.status === "success")
          return {
            job_id: submission.jobId,
            status: "success",
            tx_hash: submission.transactionHash,
            message: null,
          };
        pendingSubmissions.markSent(scope, submission, undefined);
      } catch {
        return undefined;
      }
    }
    return readCommitmentView(submission.jobId);
  };

  // Restore only by reading. Navigation, refresh and account switches must never open a wallet
  // prompt or broadcast a new input. A read failure/404 keeps the exact original retry material.
  useEffect(() => {
    if (!recovering || !submissionScope) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setRecoveryState("checking");
    setRecoveryMessage(undefined);
    const check = async () => {
      if (!recoveryRunning.current) {
        const view = await readPendingSubmission(submissionScope, recovering);
        if (cancelled || pendingSubmissions.get(submissionScope)?.jobId !== recovering.jobId) return;
        if (!recoveryRunning.current) {
          const step = view && decideCommitmentStep(view);
          if (step?.action === "committed") {
            rememberSubmission(submissionScope, recovering, step.txHash);
            setTxHash(step.txHash);
            setError("");
            addAlert(`${recovering.kind === "vote" ? "Vote" : "Mask"} submitted`, { type: "success" });
            return;
          }
          setRecoveryState(
            view === null
              ? "missing"
              : !view
                ? "unavailable"
                : step?.action === "submit"
                  ? "ready"
                  : step?.action === "wait"
                    ? "pending"
                    : "failed"
          );
          setRecoveryMessage(step?.action === "error" ? step.reason : undefined);
        }
      }
      if (!cancelled) timer = setTimeout(check, 10_000);
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // The scope and job identify the operation; UI callback identity must not restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recovering?.jobId, recovering?.transactionHash, address, body, e3Id]);

  const unconfirmed = (): BallotSubmissionResult => {
    setVotingStep("idle");
    setStepMessage("");
    setError("");
    return {
      success: false,
      uncertain: true,
      error: "Submission not confirmed yet. Check its status before trying again.",
    };
  };

  /** Finish a known job. Only the original click or an explicit recovery click may send it. */
  const finishSubmission = async (
    scope: VoteScope,
    submission: PendingSubmission,
    view: VoteResponse,
    isCurrent: () => boolean
  ): Promise<BallotSubmissionResult> => {
    const step = decideCommitmentStep(view);
    if (step.action === "committed") {
      rememberSubmission(scope, submission, step.txHash);
      if (!isCurrent()) return { success: false, error: "" };
      setTxHash(step.txHash);
      setVotingStep("complete");
      setStepMessage(`${submission.kind === "vote" ? "Vote" : "Mask"} submitted successfully!`);
      addAlert(`${submission.kind === "vote" ? "Vote" : "Mask"} submitted`, { type: "success" });
      return { success: true, txHash: step.txHash };
    }
    if (!isCurrent()) return { success: false, error: "" };
    if (step.action !== "submit") return unconfirmed();
    if (submission.prepare) {
      if (commitmentDeadline === undefined) return unconfirmed();
      const program = await resolveCrispProgram(publicClient, body, scope.roundId);
      if (!isCurrent()) return { success: false, error: "" };
      pending.save(
        buildPreparedBallot({
          scope: { chainId: scope.chainId, plugin: scope.plugin as Address, roundId: scope.roundId.toString() },
          voter: scope.voter as Address,
          program,
          attestedPayload: step.payload as Hex,
          commitmentDeadline,
        })
      );
      pendingSubmissions.remove(scope, submission);
      setPreparedReceipt(null);
      setVotingStep("idle");
      setLastActiveStep(null);
      setStepMessage("");
      addAlert("Signed ballot saved", { type: "success", description: "Switch to the wallet that will send it." });
      return { success: true, txHash: null };
    }
    if (pendingSubmissions.get(scope)?.transactionHash) return unconfirmed();
    if (!canPublishOnChain)
      throw new Error(onChainBlockedReason ?? "The round is still being checked. Try again shortly.");
    let hash: Hex;
    try {
      await putWalletOnVotingChain();
      if (!isCurrent()) return { success: false, error: "" };
      setStepMessage("Confirm this ballot's transaction in your wallet.");
      hash = await publishVoteOnChain(step.payload as Hex, {
        account: scope.voter as Address,
        onSubmitted: (transactionHash) => {
          const saved = pendingSubmissions.markSent(scope, submission, transactionHash);
          if (activeSubmission.current?.jobId === submission.jobId && saved) activeSubmission.current = saved;
        },
      });
    } catch (cause) {
      // The worker has chosen the wallet path. Declining this prompt sends nothing; a hash
      // recorded before a later RPC error still prevents discarding a broadcast transaction.
      if (decodeTxError(cause).isUserRejection && pendingSubmissions.discard(scope, submission)) {
        if (isCurrent()) {
          setVotingStep("idle");
          setLastActiveStep(null);
          setStepMessage("");
          setError("");
        }
        return { success: false, error: "" };
      }
      throw cause;
    }
    voteEvidence.record(scope, "confirmed", submission.kind === "mask", hash);
    pendingSubmissions.remove(scope, submission);
    if (!isCurrent()) return { success: false, error: "" };
    setTxHash(hash);
    setVotingStep("complete");
    setStepMessage(`${submission.kind === "vote" ? "Vote" : "Mask"} submitted successfully!`);
    return { success: true, txHash: hash };
  };

  const recoverSubmission = async () => {
    if (recoveryRunning.current || !submissionScope) return;
    const scope = operationScope.current;
    const isCurrent = () => active.current && operationScope.current === scope;
    recoveryRunning.current = true;
    setRecoveryBusy(true);
    setRecoveryMessage(undefined);
    try {
      const submission = pendingSubmissions.get(submissionScope);
      if (!submission) return;
      let view = await readPendingSubmission(submissionScope, submission);
      if (!isCurrent()) return;
      if (pendingSubmissions.get(submissionScope)?.transactionHash && !view) {
        setRecoveryState("pending");
        return;
      }
      if (!view || view.status === "failed_broadcast") {
        // Never re-encrypt/re-sign: CRISP keys durable work by this exact statement. Replaying
        // an accepted request returns its existing job, including if the earlier HTTP reply died.
        const answer = await broadcastSubmission(PUB_CRISP_SERVER_URL, submission.request);
        if (!isCurrent()) return;
        if (answer.kind === "rejected") {
          if (
            canDiscardRejectedRetry(submission, view, answer) &&
            pendingSubmissions.discard(submissionScope, submission)
          ) {
            setVotingStep("idle");
            setLastActiveStep(null);
            setStepMessage("");
            setError("");
            addAlert("Submission refused", { type: "error", description: answer.reason });
            return;
          }
          // A rate limit or an inconclusive status read cannot resolve the original job.
          setRecoveryMessage(answer.reason);
          setRecoveryState("unavailable");
          return;
        }
        view = answer.kind === "accepted" ? answer.view : undefined;
      }
      if (!view) {
        setRecoveryState("unavailable");
        return;
      }
      const result = await finishSubmission(submissionScope, submission, view, isCurrent);
      if (!isCurrent()) return;
      if (!result.success) {
        const step = decideCommitmentStep(view);
        setRecoveryState(step.action === "wait" ? "pending" : step.action === "submit" ? "ready" : "failed");
        setRecoveryMessage(step.action === "error" ? step.reason : undefined);
      }
    } catch (cause) {
      if (isCurrent())
        setRecoveryMessage(describeFailure(cause, "Could not confirm this submission. Check again.") ?? undefined);
    } finally {
      recoveryRunning.current = false;
      if (active.current) setRecoveryBusy(false);
    }
  };

  const discardSubmission = () => {
    if (!submissionScope || recoveryRunning.current || isLoading || activeSubmission.current) return;
    try {
      const discarded =
        typeof storedSubmission === "string"
          ? pendingSubmissions.clearUnreadable(submissionScope)
          : recovering && pendingSubmissions.discard(submissionScope, recovering);
      if (!discarded) return;
      setRecoveryMessage(undefined);
      setError("");
      setVotingStep("idle");
      setLastActiveStep(null);
      setStepMessage("");
    } catch {
      setRecoveryMessage("Could not clear the saved submission. Allow site storage and try again.");
    }
  };

  // All three go through the SDK (0.12.0) rather than hand-rolled fetches, so the
  // route names and payload shapes stay owned by the SDK.
  const getRoundState = async (e3Id: bigint): Promise<IRoundDetailsResponse> => {
    return (await crispSdk.getRoundStateLite(e3Id)) as unknown as IRoundDetailsResponse;
  };

  const getTokenHoldersHashes = async (e3Id: bigint): Promise<bigint[]> => {
    const hashes = await crispSdk.getTokenHolderHashes(e3Id);
    return hashes.map((h) => BigInt(h.startsWith("0x") ? h : `0x${h}`));
  };

  const getEligibleVoters = async (e3Id: bigint): Promise<EligibleVoter[]> => {
    const holders = await crispSdk.getEligibleAddresses(e3Id);
    return holders.map((v) => ({ address: v.address, balance: BigInt(v.balance) }));
  };
  const handleMask = async (
    e3Id: bigint,
    numOptions: string,
    /// Set for an ONCHAIN round: the program that will verify the mask.
    crispProgram?: `0x${string}`,
    /// The slot to mask. Without one, a random eligible voter's.
    target?: Address
  ): Promise<VoteData> => {
    const zeroVote = getZeroVote(Number.parseInt(numOptions));

    // An ONCHAIN round needs no census for a chosen slot: the program is the authority on its
    // weight. `votingPowerOf` skips the eligibility floor, but such a round refuses any floor below
    // one ballot unit (`MinVotingPowerBelowScale`), so zero here always means `publishInput` would
    // reject the slot with `SlotNotEligible` — better said now than after proving.
    if (target && crispProgram) {
      const balance = await getOnchainVotingPower(publicClient, crispProgram, e3Id, target);
      if (balance === 0n) {
        throw new Error(`${target} holds no voting power in this round, so it cannot be masked.`);
      }
      return { vote: zeroVote, balance, slotAddress: target };
    }

    const eligibleVoters = await getEligibleVoters(e3Id);

    if (!eligibleVoters || eligibleVoters.length === 0) {
      throw new Error("No eligible voters available for masking");
    }

    // A Merkle round proves the slot's census leaf, so a chosen slot has to be in the census.
    const voter = target
      ? eligibleVoters.find((v) => equalAddresses(v.address, target))
      : getRandomVoterToMask(eligibleVoters);

    if (!voter) {
      throw new Error(`${target} is not in this round's census, so it cannot be masked.`);
    }

    // A mask is still checked against public input 4, so its voting power has to be the number
    // the contract will supply for that slot — not the balance the server recorded. The two
    // usually coincide, because both scale by the round's recorded divisor, but a mask that got it
    // wrong would fail in the verifier.
    const balance = crispProgram
      ? await getOnchainVotingPower(publicClient, crispProgram, e3Id, voter.address as `0x${string}`)
      : voter.balance;

    return {
      vote: zeroVote,
      balance,
      slotAddress: voter.address,
    };
  };

  const getVoteWeight = useCallback(
    async (randomize: boolean, percentage?: number): Promise<BallotWeight> => {
      if (e3Id === undefined || !address) throw new Error("Connect your wallet before reviewing a ballot.");
      const roundState = PUB_VOTING_ON_AZTEC
        ? AZTEC_ROUND_CREDITS
        : ((await crispSdk.getRoundStateLite(e3Id)) as unknown as IRoundDetailsResponse);
      const program = await resolveCrispProgram(publicClient, body, e3Id);
      // The votes program on Aztec has no census mode: weights always come from `weightOf`.
      const census = PUB_VOTING_ON_AZTEC ? CensusMode.ONCHAIN : await getCensusMode(publicClient, program, e3Id);
      const { available, power, unit, decimals } = await resolveVoteBalance(
        body,
        e3Id,
        address,
        roundState,
        census === CensusMode.ONCHAIN ? program : undefined
      );
      return {
        roundId: e3Id,
        voter: address,
        available,
        power,
        counted: chooseBallotWeight(available, randomize, percentage),
        randomize,
        percentage,
        unit,
        decimals,
      };
    },
    [body, e3Id, address]
  );

  const handleVote = async (
    e3Id: bigint,
    voteOption: bigint,
    numOptions: number,
    roundState: RoundCredits,
    crispProgram: `0x${string}` | undefined,
    weight: BallotWeight | undefined
  ): Promise<VoteData> => {
    const { available } = await resolveVoteBalance(body, e3Id, address!, roundState, crispProgram);
    return {
      vote: reviewedVote(weight, available, e3Id, address!, Number(voteOption), numOptions),
      // Eligibility still proves the FULL balance. Only the encrypted choice is reduced.
      balance: available,
      slotAddress: address!,
    };
  };

  /**
   * Move the wallet to the chain that the ballot names, before the wallet signs or sends.
   *
   * The header asks for this switch only once and does not wait for it, so a dismissed request is
   * not repeated. A relayed ballot sends no transaction, so nothing else moves the wallet. Rainbow
   * compares the chain of an EIP-712 domain with the chain of the site's session. On a mismatch it
   * answers with an error and does not open its window, so the voter sees no request at all.
   */
  const putWalletOnVotingChain = async () => {
    if (walletChainId === PUB_CHAIN.id) return;
    setStepMessage(`Please switch your wallet to ${PUB_CHAIN.name}.`);
    await switchChainAsync({ chainId: PUB_CHAIN.id });
  };

  /**
   * Have the wallet sign `typedData`: move it to the voting chain, say which wallet the request went to, and
   * hint when a wallet accepted the request without showing it.
   */
  const signWithWallet = async (
    typedData: Parameters<typeof signTypedDataAsync>[0],
    prompt: (walletName: string) => string,
    isCurrent: () => boolean
  ): Promise<Hex> => {
    setVotingStep("signing");
    setLastActiveStep("signing");
    await putWalletOnVotingChain();
    if (!isCurrent()) throw new Error("Ballot operation is no longer current.");
    // Name the connection, so the voter knows where the request went. A WalletConnect session
    // sends it to the wallet app on the phone, not to a browser extension.
    const walletName =
      connector?.type === "walletConnect"
        ? "the wallet app that you connected with WalletConnect"
        : (connector?.name ?? "your wallet");
    setStepMessage(prompt(walletName));

    // A wallet can accept a request and never show it. After a delay, say where to look.
    const stillWaiting = setTimeout(() => {
      if (!isCurrent()) return;
      setStepMessage(
        `Still waiting for your signature in ${walletName}. If no request appeared, unlock the wallet, check that it is connected to this site on ${PUB_CHAIN.name}, and reload the page.`
      );
    }, SIGNATURE_WAIT_HINT_MS);
    const signature = await signTypedDataAsync(typedData).finally(() => clearTimeout(stillWaiting));

    // The proof needs a plain 65-byte ECDSA signature. Anything else is a smart-contract account's
    // EIP-1271 answer (a Safe), which the ballot circuit does not verify yet; the SDK would
    // otherwise fail with a bare "invalid signature length".
    if (size(signature) !== 65) {
      throw new Error(
        "This wallet signed with a smart-contract signature (for example a Safe), which secret ballots don't support yet. Vote from a regular wallet with its own key."
      );
    }
    return signature;
  };

  /**
   * The Aztec route: the ballot is encrypted and proven here, the CRISP server stages its ciphertext, and the voter's
   * embedded Aztec account sends it (fees sponsored). There is no relay, wallet-sent or prepared-ballot path: nothing is
   * published on Ethereum, so none of them has anything to send, and no submission is saved for recovery.
   */
  const postAztecBallot = async (
    voteOption: bigint,
    e3Id: bigint,
    isAMask: boolean,
    options: PostVoteOptions,
    evidenceScope: VoteScope,
    fail: (reason: string, message?: string) => BallotSubmissionResult,
    isCurrent: () => boolean
  ): Promise<BallotSubmissionResult> => {
    const { weight } = options;
    const crispProgram = await resolveCrispProgram(publicClient, body, e3Id);
    setStepMessage("Checking the round on Aztec…");
    try {
      await assertAztecRoundOpen(crispProgram, e3Id);
    } catch (reason) {
      return fail(reason instanceof Error ? reason.message : "The round is not accepting ballots on Aztec.");
    }

    // The same verified key as on Ethereum: from the registry's logs, else from the CRISP server, and either way only
    // when its recomputed BFV commitment matches the round's.
    const serverKey = await crispSdk.getRoundPublicKey(e3Id).catch(() => undefined);
    const resolved = await resolveCommitteeKey(serverKey);
    if (!resolved.key || !resolved.presetName) return fail(resolved.reason ?? "The committee public key could not be verified.");

    const numOptions = await getRoundNumOptions(publicClient, body, e3Id);
    const voteData = isAMask
      ? await handleMask(e3Id, String(numOptions), crispProgram, options.maskTarget)
      : await handleVote(e3Id, voteOption, numOptions, AZTEC_ROUND_CREDITS, crispProgram, weight);
    const counted = voteData.vote.reduce((sum, units) => sum + BigInt(units), 0n);

    setVotingStep("generating_proof");
    setLastActiveStep("generating_proof");
    setStepMessage("Loading the circuits…");
    await ensureCircuits(resolved.presetName);

    const share = isAMask ? "" : ballotWeightPercentage({ ...weight!, counted });

    // The wallet signs twice at most: the round's staging key once, and the ballot (never for a mask).
    const sign = async (kind: SignKind, typedData: Parameters<typeof signTypedDataAsync>[0]): Promise<Hex> => {
      const signature = await signWithWallet(
        typedData,
        (wallet) =>
          kind === "ballot"
            ? `Please sign your ballot in ${wallet}. It counts ${share} of your voting power.`
            : `Please sign this round's staging key in ${wallet}. It lets you submit ballots without revealing which wallet they come from, and it costs no gas.`,
        isCurrent
      );
      setVotingStep("generating_proof");
      setLastActiveStep("generating_proof");
      return signature;
    };

    const { castAztecBallot } = await import("../utils/aztec/castBallot");
    const hash = await castAztecBallot({
      program: crispProgram,
      e3Id,
      l1ChainId: PUB_CHAIN.id,
      own: address as Address,
      slot: voteData.slotAddress as Address,
      credits: voteData.balance,
      vote: isAMask ? undefined : voteData.vote,
      numOptions,
      committeePublicKey: resolved.key,
      sign,
      onProgress: (step, message) => {
        setVotingStep(step);
        setLastActiveStep(step);
        setStepMessage(message);
      },
    });

    const label = isAMask ? "Mask" : "Vote";
    voteEvidence.record(evidenceScope, "confirmed", isAMask);
    setVotingStep("complete");
    // The hash is an Aztec transaction: it must not become a link to the Ethereum explorer.
    setStepMessage(`${label} submitted on Aztec (transaction ${hash}).`);
    addAlert(`${label} submitted successfully!`, { timeout: 3000, type: "success" });
    return { success: true, txHash: null };
  };

  const postVote = async (
    voteOption: bigint,
    e3Id: bigint,
    snapshotBlock: bigint,
    isAMask: boolean = false,
    submitOnChain: boolean = false,
    options: PostVoteOptions = {}
  ): Promise<BallotSubmissionResult> => {
    const scope = operationScope.current;
    const isCurrent = () => active.current && operationScope.current === scope;
    const cancelled = new Error("Ballot operation is no longer current.");
    const ensureCurrent = () => {
      if (!isCurrent()) throw cancelled;
    };
    let staged: PendingSubmission | undefined;
    const evidenceScope = address ? { chainId: PUB_CHAIN.id, plugin: body, roundId: e3Id, voter: address } : undefined;
    // The store check is synchronous: even an old review dialog cannot start a second request.
    if (evidenceScope) {
      try {
        if (pendingSubmissions.get(evidenceScope)) return unconfirmed();
      } catch {
        return { success: false, uncertain: true, error: "Check the saved submission before voting again." };
      }
    }
    setIsLoading(true);
    // The indicator reads any hash as success, so a previous ballot's must not outlive this one.
    setTxHash(null);
    // A new attempt starts clean: the previous failure must not outlive it.
    setError("");
    setProofProgress(null);
    // A declined prompt is the voter's choice, not a failure: an empty error, nothing to show.
    const declined = { success: false as const, error: "" };
    const { weight, deferSend = false } = options;
    // A deferred vote is staged for the wallet to send, exactly as a wallet send is.
    const sendFromWallet = submitOnChain || deferSend;
    const fail = (reason: string, message = reason) => {
      setError(reason);
      setVotingStep("error");
      setStepMessage(message);
      return { success: false as const, error: reason };
    };

    try {
      if (!address) {
        return fail("No wallet address found");
      }
      if (deferSend && isAMask) {
        return fail("A mask cannot be signed for another wallet to send.");
      }
      if (!isAMask && (!weight || weight.roundId !== e3Id || !equalAddresses(weight.voter, address))) {
        return fail("Review your voting power before submitting the ballot.");
      }
      if (deferSend && pending.ballot) {
        return fail("Send or discard your prepared ballot first.");
      }

      addAlert(`${isAMask ? "Masking" : "Vote"} generation started! Please do not leave the current page.`, {
        timeout: 3000,
        type: "info",
      });

      if (PUB_VOTING_ON_AZTEC) {
        return await postAztecBallot(voteOption, e3Id, isAMask, options, evidenceScope!, fail, isCurrent);
      }

      const roundState = await getRoundState(e3Id);
      ensureCurrent();

      if (roundState.status !== "Active") {
        return fail(
          "This round is not accepting votes yet. Please wait and try again.",
          "This round is not accepting votes yet."
        );
      }

      // Bail out before signing and proof generation when the chain stage or input window
      // already blocks on-chain publication. `canPublish` is false while the preconditions are
      // still being read too, in which case there is no reason to report yet.
      if (sendFromWallet && !canPublishOnChain) {
        const reason =
          onChainBlockedReason ??
          "Still checking whether this round accepts on-chain votes. Please try again in a moment.";
        return fail(reason);
      }

      // The committee key comes from `CommitteePublished` logs, falling back to the CRISP server
      // only when the key was never published on-chain. Either way it is accepted only if its
      // recomputed BFV commitment matches the round's on-chain `committeePublicKey`, so nobody —
      // relayer or log spammer — can substitute a key they hold the secret for and decrypt the
      // ballot. Resolved BEFORE anything is encrypted to it.
      const resolved = await resolveCommitteeKey(toKeyBytes(roundState.committee_public_key));
      ensureCurrent();
      if (!resolved.key || !resolved.presetName) {
        const reason = resolved.reason ?? "The committee public key could not be verified.";
        return fail(reason);
      }

      const publicKey = resolved.key;
      const presetName = resolved.presetName;

      // Resolved before the ballot is built: an ONCHAIN round takes its weight from this contract
      // rather than from a census, so the program has to be known first.
      const crispProgram = await resolveCrispProgram(publicClient, body, e3Id);
      ensureCurrent();
      const censusMode = await getCensusMode(publicClient, crispProgram, e3Id);
      ensureCurrent();
      const isOnchainCensus = censusMode === CensusMode.ONCHAIN;

      let voteData;
      if (isAMask) {
        voteData = await handleMask(
          e3Id,
          roundState.num_options,
          isOnchainCensus ? crispProgram : undefined,
          options.maskTarget
        );
      } else {
        voteData = await handleVote(
          e3Id,
          voteOption,
          Number.parseInt(roundState.num_options),
          roundState,
          isOnchainCensus ? crispProgram : undefined,
          weight
        );
      }
      ensureCurrent();

      // The weight the ballot counts: zero for a mask, else the reviewed share of `balance`.
      const counted = voteData.vote.reduce((sum, units) => sum + BigInt(units), 0n);

      // An on-chain census has no tree: `publishInput` reads each voter's power from the token, so
      // there is no holder list to fetch and no root to prove against. Asking for one would 404 —
      // the coordinator never builds it for these rounds.
      const merkleLeaves = isOnchainCensus ? [] : await getTokenHoldersHashes(e3Id);
      ensureCurrent();

      // Step 2: Encrypt the ballot. Split from proving because the signature covers a digest that
      // commits to this exact ciphertext, so the ballot has to exist before the voter can sign it.
      setVotingStep("generating_proof");
      setLastActiveStep("generating_proof");
      setStepMessage(isAMask ? "Encrypting mask..." : "Encrypting vote...");

      const ballotBase = {
        vote: voteData.vote,
        publicKey,
        slotAddress: voteData.slotAddress,
        isMaskVote: isAMask,
        numOptions: Number.parseInt(roundState.num_options),
      };

      // The BFV circuits are preset-bound since SDK 0.18 and must be registered before any
      // encryption or proving. The preset comes from the round's on-chain parameters — resolved
      // alongside the committee key — so a round running secure parameters proves against secure
      // circuits with no change here. Loaded lazily so the ~3MB artifacts only download when
      // voting.
      await ensureCircuits(presetName);
      ensureCurrent();

      // The SDK's own prepareBallot (not the standalone one): it resolves the slot's head —
      // previous ciphertext plus its tree index — from the server and threads the pair into the
      // circuit inputs, which is what lets a re-vote or a mask extend the slot's existing chain.
      const prepared = await crispSdk.prepareBallot(
        isOnchainCensus
          ? { e3Id, ...ballotBase, censusMode: "onchain", votingPower: voteData.balance }
          : { e3Id, ...ballotBase, censusMode: "merkle", merkleLeaves, balance: voteData.balance }
      );
      ensureCurrent();

      // The digest comes from the contract that will verify the ballot, not from a struct rebuilt
      // here. `publishInput` recomputes it and the circuit proves the signature covers it, so a
      // local copy that drifted would produce ballots every node rejects.
      const digest = await getBallotDigest(
        publicClient,
        crispProgram,
        e3Id,
        voteData.slotAddress as `0x${string}`,
        prepared.ctCommitment
      );
      ensureCurrent();

      let proof;
      // Each stage start is timestamped so the indicator can say what is being proved and estimate
      // how long is left from how fast this device ran the earlier stages.
      const onProgress = ({ index }: ProofProgress) => {
        if (!isCurrent()) return;
        setProofProgress((current) => ({
          isMask: isAMask === true,
          presetName,
          stageStartedAt: [...(current?.stageStartedAt ?? []).slice(0, index), Date.now()],
        }));
      };
      // The SDK reports stage 1 only after it has loaded the prover, which on a first proof can take
      // a while. Show stage 1 as soon as proving starts; its first report replaces this timestamp,
      // so the load does not skew the estimate.
      const showFirstStage = () =>
        setProofProgress({ isMask: isAMask === true, presetName, stageStartedAt: [Date.now()] });

      if (isAMask) {
        // A mask carries a real digest and a placeholder signature. It must be indistinguishable
        // from a real ballot on-chain, and it is cast for someone else's slot, so there is no key
        // to sign with and no wallet prompt.
        // Encryption is quick; the proof is the slow part, so say so as it starts, as a vote does.
        setStepMessage("Generating proof for the mask...");
        showFirstStage();
        proof = await finishMaskProof(prepared, digest, { onProgress });
      } else {
        // The voter reviewed this weight before signing: a random or custom share, or the full
        // voting power. `handleVote` checked the review against
        // this round's balance, so its unit and power measure the encrypted weight.
        const share = ballotWeightPercentage({ ...weight!, counted });

        // Step 3: Signing, now that there is a ciphertext to bind to.
        const request = ballotSignatureRequest({
          chainId: PUB_CHAIN.id,
          crispProgram,
          e3Id,
          slot: voteData.slotAddress as Address,
          ciphertextCommitment: prepared.ctCommitment,
        });

        // `signTypedData`, not `signMessage`: `ballotDigest` returns an EIP-712 digest that a
        // wallet signs directly. `signMessage` would add the EIP-191 prefix and sign a different
        // one, and every ballot would fail looking like a bad signature.
        const signature = await signWithWallet(
          request,
          (wallet) => `Please sign your ballot in ${wallet}. It counts ${share} of your voting power.`,
          isCurrent
        );
        ensureCurrent();

        setVotingStep("generating_proof");
        setLastActiveStep("generating_proof");
        setStepMessage(`Generating proof for a ballot that counts ${share} of your voting power...`);

        showFirstStage();
        proof = await finishBallotProof(prepared, digest, signature, { onProgress });
      }
      ensureCurrent();

      const encodedProof = encodeSolidityProof(proof);

      const voteBody: BroadcastVoteRequest = {
        encoded_proof: encodedProof,
        address: voteData.slotAddress,
        round_id: e3Id.toString(),
        send_from_wallet: sendFromWallet,
      };

      // Step 3: Broadcasting
      setVotingStep("broadcasting");
      setLastActiveStep("broadcasting");

      // Everything above this point is identical for both routes: the ballot is encrypted and
      // proven locally. Both routes stage the input with the server first. That is not a relay:
      // staging stores the ciphertext and signs the availability attestation.
      //
      // `encodeSolidityProof` builds `InputEnvelope` — six fields, ending in `availabilityProof`.
      //
      // The server then chooses who sends the commitment (`decideCommitmentStep`). With
      // `send_from_wallet`, it hands the attested payload to this wallet and does not relay.
      setStepMessage("Preparing your vote for submission...");

      staged = {
        jobId: submissionJobId(e3Id.toString(), encodedProof),
        kind: isAMask ? "mask" : "vote",
        prepare: deferSend,
        request: voteBody,
      };
      activeSubmission.current = staged;
      pendingSubmissions.save(evidenceScope!, staged);
      ensureCurrent();
      const answer = await broadcastSubmission(PUB_CRISP_SERVER_URL, voteBody);
      if (answer.kind === "rejected") {
        pendingSubmissions.remove(evidenceScope!, staged);
        ensureCurrent();
        return fail(answer.reason);
      }
      let view = answer.kind === "accepted" ? answer.view : await readCommitmentView(staged.jobId);
      if (view && decideCommitmentStep(view).action === "wait") {
        if (isCurrent()) {
          setVotingStep("confirming");
          setLastActiveStep("confirming");
          setStepMessage("Your ballot is queued. Waiting for confirmation...");
        }
        view = await waitForCommitmentDecision(
          staged.jobId,
          readCommitmentView,
          () => !isCurrent() && (isAMask || sendFromWallet)
        );
      }
      if (view) return await finishSubmission(evidenceScope!, staged, view, isCurrent);
      ensureCurrent();
      return unconfirmed();
    } catch (error) {
      if (!isCurrent() || error === cancelled) return declined;
      // A request may have reached the server. Keep its ciphertext and stable job ID; reporting
      // failure or regenerating a ballot here could replace a vote that was already accepted.
      if (staged && evidenceScope && pendingSubmissions.get(evidenceScope)) return unconfirmed();
      console.error("Error in postVote:", error);
      // viem's `message` appends the request arguments, and a ballot's calldata is tens of KB of
      // unbroken hex; `describeFailure` keeps the one-line summary and names known contract errors.
      // A declined prompt is not a failure: the transaction manager already raises its own alert
      // for a transaction, and a declined ballot signature was the voter's choice — so the card
      // simply resets.
      const reason = describeFailure(error, "The ballot could not be submitted");
      setError(reason ?? "");
      setVotingStep(reason === undefined ? "idle" : "error");
      setStepMessage(reason ?? "");
      return { success: false, error: reason ?? "" };
    } finally {
      if (activeSubmission.current?.jobId === staged?.jobId) activeSubmission.current = null;
      if (isCurrent()) setIsLoading(false);
    }
  };

  const prepareVote = (voteOption: bigint, snapshotBlock: bigint, weight: BallotWeight) => {
    if (e3Id === undefined) return Promise.resolve({ success: false as const, error: "Proposal unavailable." });
    return postVote(voteOption, e3Id, snapshotBlock, false, false, { weight, deferSend: true });
  };

  const sendPreparedVote = async (): Promise<BallotSubmissionResult> => {
    if (sendingPrepared.current) return { success: false, error: "A ballot is already being sent." };
    sendingPrepared.current = true;
    setIsLoading(true);
    setError("");
    let ballot = pending.ballot;
    try {
      if (!ballot) throw new Error("No prepared ballot is available.");
      // Reload the saved payload. It is never rebuilt from the sender's address or voting power.
      ballot = ballot.transactionHash ? ballot : readPreparedBallot(window.localStorage, ballot);
      if (!ballot) throw new Error("The prepared ballot expired or was removed. Prepare it again.");
      // A hash that was already broadcast is only checked, so the wallet and its chain do not matter.
      if (!ballot.transactionHash) await putWalletOnVotingChain();
      const senderError = preparedSenderError(ballot, address, PUB_CHAIN.id);
      if (senderError) throw new Error(senderError);
      setTxHash(ballot.transactionHash ?? null);
      let sender = ballot.transactionHash ? undefined : address;
      const hash = await sendPreparedBallot({
        ballot,
        sender: address,
        chainId: PUB_CHAIN.id,
        publish: publishVoteOnChain,
        receipt: async (transactionHash) => {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
          sender = receipt.from;
          return receipt;
        },
        save: (saved) => {
          if (saved.transactionHash) setTxHash(saved.transactionHash);
          pending.save(saved);
        },
        remove: pending.remove,
      });
      setTxHash(hash);
      voteEvidence.record(
        { chainId: ballot.chainId, plugin: ballot.plugin, roundId: BigInt(ballot.roundId), voter: ballot.voter },
        "confirmed",
        false,
        hash
      );
      setPreparedReceipt({ voter: ballot.voter, sender, txHash: hash });
      addAlert("Vote submitted", {
        timeout: 4000,
        type: "success",
        description: "The vote counts for the wallet that signed it.",
      });
      return { success: true, txHash: hash };
    } catch (cause) {
      // A declined wallet prompt leaves the ballot saved and shows nothing: the voter chose it.
      const reason = describeFailure(cause, "Could not send the prepared ballot.") ?? "";
      setError(reason);
      return { success: false, error: reason };
    } finally {
      sendingPrepared.current = false;
      setIsLoading(false);
    }
  };

  return {
    getVoteWeight,
    postVote,
    error,
    isLoading,
    votingStep,
    lastActiveStep,
    stepMessage,
    proofProgress,
    txHash,
    canPublishOnChain,
    onChainBlockedReason,
    submissionRecovery: recovering
      ? {
          kind: recovering.kind,
          state: recoveryState,
          busy: recoveryBusy,
          message: recoveryMessage,
          canDiscard: !recovering.transactionHash,
        }
      : typeof storedSubmission === "string"
        ? {
            kind: "vote",
            state: "unreadable",
            busy: recoveryBusy,
            message: recoveryMessage ?? storedSubmission,
            canDiscard: true,
          }
        : null,
    recoverSubmission,
    discardSubmission,
    preparedBallot: pending.ballot,
    preparedReceipt,
    changePreparedVote: () => setPreparedReceipt(null),
    prepareVote,
    sendPreparedVote,
    discardPreparedVote: () => {
      if (pending.ballot && !sendingPrepared.current) {
        pending.remove(pending.ballot);
        setError("");
      }
    },
  };
}
