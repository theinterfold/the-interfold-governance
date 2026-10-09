import { voteEvidence } from "../utils/voteEvidence";
import { ballotWeightPercentage, chooseBallotWeight, reviewedVote, type BallotWeight } from "../utils/ballotWeight";
import { PUB_CHAIN, PUB_CRISP_SERVER_URL, PUB_VOTING_POWER_SOURCE } from "@/constants";
import { usePrivatePair } from "./usePrivatePair";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import { CreditsMode } from "../utils/types";
import type { EligibleVoter, IRoundDetailsResponse, VoteData, VotingStep } from "../utils/types";
import { encodeSolidityProof, finishBallotProof, finishMaskProof, getZeroVote } from "@crisp-e3/sdk";
import { ensureCircuits } from "../utils/circuits";
import { iVotesAbi } from "../artifacts/iVotes";
import { parseAbi, size, type Address, type Hex } from "viem";
import { publicClient } from "../utils/client";
import { useAlerts } from "@/context/Alerts";
import { crispSdk } from "../utils/crispSdk";
import { getRandomVoterToMask } from "../utils/voters";
import { equalAddresses } from "@/utils/evm";
import { readServerRejection } from "../utils/readServerRejection";
import { describeFailure } from "../utils/describeFailure";
import { snapshotReadBlock } from "../utils/snapshotReadBlock";
import {
  CensusMode,
  ballotSignatureRequest,
  getBallotDigest,
  getCensusMode,
  getOnchainVotingPower,
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

/** Limit for one read of a staged ballot's job. */
const JOB_READ_TIMEOUT_MS = 15_000;

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

async function resolveVoteBalance(
  body: `0x${string}`,
  e3Id: bigint,
  address: string,
  roundState: IRoundDetailsResponse,
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
  getVoteWeight: (randomize: boolean) => Promise<BallotWeight>;
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
  } = usePublishVote(e3Id);

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

  const { signTypedDataAsync } = useSignTypedData();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [txHash, setTxHash] = useState<string | null>(null);

  // A wallet prompt must not open from a page that the voter already left. The worker can take
  // minutes to choose who sends a ballot, so the wait can outlive the page.
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  /** Read one staged ballot's job: its view, `null` when the server does not know it, else `undefined`. */
  const readCommitmentView = async (jobId: string): Promise<VoteResponse | null | undefined> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), JOB_READ_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${PUB_CRISP_SERVER_URL.replace(/\/$/, "")}/voting/availability/${encodeURIComponent(jobId)}`,
        { signal: abort.signal }
      );
      if (response.status === 404) return null;
      if (!response.ok) return undefined;
      return (await response.json()) as VoteResponse;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
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
    async (randomize: boolean): Promise<BallotWeight> => {
      if (e3Id === undefined || !address) throw new Error("Connect your wallet before reviewing a ballot.");
      const roundState = (await crispSdk.getRoundStateLite(e3Id)) as unknown as IRoundDetailsResponse;
      const program = await resolveCrispProgram(publicClient, body, e3Id);
      const census = await getCensusMode(publicClient, program, e3Id);
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
        counted: chooseBallotWeight(available, randomize),
        randomize,
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
    roundState: IRoundDetailsResponse,
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

  const postVote = async (
    voteOption: bigint,
    e3Id: bigint,
    snapshotBlock: bigint,
    isAMask: boolean = false,
    submitOnChain: boolean = false,
    options: PostVoteOptions = {}
  ): Promise<BallotSubmissionResult> => {
    setIsLoading(true);
    // The indicator reads any hash as success, so a previous ballot's must not outlive this one.
    setTxHash(null);
    // A new attempt starts clean: the previous failure must not outlive it.
    setError("");
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

      const evidenceScope = {
        chainId: PUB_CHAIN.id,
        plugin: body,
        roundId: e3Id,
        voter: address,
      };

      addAlert(`${isAMask ? "Masking" : "Vote"} generation started! Please do not leave the current page.`, {
        timeout: 3000,
        type: "info",
      });

      const roundState = await getRoundState(e3Id);

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
      if (!resolved.key || !resolved.presetName) {
        const reason = resolved.reason ?? "The committee public key could not be verified.";
        return fail(reason);
      }

      const publicKey = resolved.key;
      const presetName = resolved.presetName;

      // Resolved before the ballot is built: an ONCHAIN round takes its weight from this contract
      // rather than from a census, so the program has to be known first.
      const crispProgram = await resolveCrispProgram(publicClient, body, e3Id);
      const censusMode = await getCensusMode(publicClient, crispProgram, e3Id);
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

      // The weight the ballot counts: zero for a mask, else the reviewed share of `balance`.
      const counted = voteData.vote.reduce((sum, units) => sum + BigInt(units), 0n);

      // An on-chain census has no tree: `publishInput` reads each voter's power from the token, so
      // there is no holder list to fetch and no root to prove against. Asking for one would 404 —
      // the coordinator never builds it for these rounds.
      const merkleLeaves = isOnchainCensus ? [] : await getTokenHoldersHashes(e3Id);

      // Step 2: Encrypt the ballot. Split from proving because the signature covers a digest that
      // commits to this exact ciphertext, so the ballot has to exist before the voter can sign it.
      setVotingStep("generating_proof");
      setLastActiveStep("generating_proof");
      setStepMessage("Encrypting vote...");

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

      // The SDK's own prepareBallot (not the standalone one): it resolves the slot's head —
      // previous ciphertext plus its tree index — from the server and threads the pair into the
      // circuit inputs, which is what lets a re-vote or a mask extend the slot's existing chain.
      const prepared = await crispSdk.prepareBallot(
        isOnchainCensus
          ? { e3Id, ...ballotBase, censusMode: "onchain", votingPower: voteData.balance }
          : { e3Id, ...ballotBase, censusMode: "merkle", merkleLeaves, balance: voteData.balance }
      );

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

      let proof;

      if (isAMask) {
        // A mask carries a real digest and a placeholder signature. It must be indistinguishable
        // from a real ballot on-chain, and it is cast for someone else's slot, so there is no key
        // to sign with and no wallet prompt.
        proof = await finishMaskProof(prepared, digest);
      } else {
        // The voter reviewed this weight before signing: a random share of the voting power, or all
        // of it when the voter turned the random weight off. `handleVote` checked the review against
        // this round's balance, so its unit and power measure the encrypted weight.
        const share = ballotWeightPercentage({ ...weight!, counted });

        // Step 3: Signing, now that there is a ciphertext to bind to.
        setVotingStep("signing");
        setLastActiveStep("signing");
        await putWalletOnVotingChain();
        // Name the connection, so the voter knows where the request went. A WalletConnect session
        // sends it to the wallet app on the phone, not to a browser extension.
        const walletName =
          connector?.type === "walletConnect"
            ? "the wallet app that you connected with WalletConnect"
            : (connector?.name ?? "your wallet");
        setStepMessage(`Please sign your ballot in ${walletName}. It counts ${share} of your voting power.`);

        const request = ballotSignatureRequest({
          chainId: PUB_CHAIN.id,
          crispProgram,
          e3Id,
          slot: voteData.slotAddress as Address,
          ciphertextCommitment: prepared.ctCommitment,
        });

        // A wallet can accept a request and never show it. After a delay, say where to look.
        const stillWaiting = setTimeout(() => {
          if (!active.current) return;
          setStepMessage(
            `Still waiting for your signature in ${walletName}. If no request appeared, unlock the wallet, check that it is connected to this site on ${PUB_CHAIN.name}, and reload the page.`
          );
        }, SIGNATURE_WAIT_HINT_MS);

        // `signTypedData`, not `signMessage`: `ballotDigest` returns an EIP-712 digest that a
        // wallet signs directly. `signMessage` would add the EIP-191 prefix and sign a different
        // one, and every ballot would fail looking like a bad signature.
        const signature = await signTypedDataAsync(request).finally(() => clearTimeout(stillWaiting));

        // The proof needs a plain 65-byte ECDSA signature. Anything else is a smart-contract account's
        // EIP-1271 answer (a Safe), which the ballot circuit does not verify yet; the SDK would
        // otherwise fail with a bare "invalid signature length".
        if (size(signature) !== 65) {
          throw new Error(
            "This wallet signed with a smart-contract signature (for example a Safe), which secret ballots don't support yet. Vote from a regular wallet with its own key."
          );
        }

        setVotingStep("generating_proof");
        setLastActiveStep("generating_proof");
        setStepMessage(`Generating proof for a ballot that counts ${share} of your voting power...`);

        proof = await finishBallotProof(prepared, digest, signature);
      }

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

      const response = await fetch(`${PUB_CRISP_SERVER_URL}/voting/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(voteBody),
      });

      // The relay answers 200 only when this exact statement already has a completed durable job,
      // and 202 when it staged fresh work — the normal path for a new vote, because Avail
      // publication is asynchronous. Treating 202 as failure reports "Failed to broadcast vote"
      // over a vote the server accepted and went on to publish on-chain. Accept every 2xx;
      // anything else is a real rejection and carries the server's reason.
      if (!response.ok) {
        // Every rejection path in the server's `/voting/broadcast` sets a specific `message`:
        // "Too many votes from this address, slow down", "The vote commitment deadline has
        // passed", "The availability service is temporarily unavailable", and so on. Discarding
        // it for a flat "Failed to broadcast vote" throws away the one thing that tells the voter
        // whether to wait, retry, or stop — and it is the difference between a rate limit and a
        // closed ballot.
        const reason = await readServerRejection(response);
        return fail(reason);
      }

      const voteResponse = (await response.json()) as VoteResponse;
      const label = isAMask ? "Masking" : voteResponse.is_vote_update ? "Vote update" : "Vote";

      let step = decideCommitmentStep(voteResponse);
      if (step.action === "wait") {
        setVotingStep("confirming");
        setLastActiveStep("confirming");
        setStepMessage("Your ballot is queued. Waiting for the server to send it or to ask your wallet to send it...");
        const decided = await waitForCommitmentDecision(step.jobId, readCommitmentView, () => !active.current);
        if (!active.current) return declined;
        if (decided === null) {
          step = { action: "error", reason: "The server no longer has this ballot. Submit it again." };
        } else if (decided) {
          step = decideCommitmentStep(decided);
        }
      }

      // `wait` remains only when the server chose no sender before the wait ended.
      if (step.action === "wait" || step.action === "error") {
        const reason =
          step.action === "error" ? step.reason : "The server has not processed this ballot yet. Try again later.";
        return fail(reason);
      }

      if (step.action === "committed") {
        if (step.txHash) setTxHash(step.txHash);
        voteEvidence.record(evidenceScope, "submitted", isAMask);
        setVotingStep("complete");
        setStepMessage(`${label} submitted successfully!`);
        addAlert(`${label} submitted successfully!`, { timeout: 3000, type: "success" });
        return { success: true, txHash: step.txHash };
      }

      // The wallet sends the ATTESTED payload, not `encodedProof`: only the server can sign it.
      // The voter chose this route, or the server did not relay the ballot.
      if (!active.current) return declined;

      // Prepare only: keep the attested payload for another wallet to send. Nothing is sent now,
      // and `buildPreparedBallot` refuses a payload that names another slot than the signer's.
      if (deferSend) {
        if (commitmentDeadline === undefined) throw new Error("The voting deadline has not loaded yet. Try again.");
        pending.save(
          buildPreparedBallot({
            scope: { chainId: PUB_CHAIN.id, plugin: body, roundId: e3Id.toString() },
            voter: address,
            program: crispProgram,
            attestedPayload: step.payload as Hex,
            commitmentDeadline,
          })
        );
        setPreparedReceipt(null);
        setVotingStep("idle");
        setLastActiveStep(null);
        setStepMessage("");
        addAlert("Signed ballot saved", {
          timeout: 4000,
          type: "success",
          description: "Switch to the wallet that will send it.",
        });
        return { success: true, txHash: null };
      }

      await putWalletOnVotingChain();
      setStepMessage(
        submitOnChain
          ? "Publishing your vote on-chain..."
          : "The server did not relay this ballot. Confirm the transaction in your wallet to submit it."
      );
      const hash = await publishVoteOnChain(step.payload as `0x${string}`);
      setTxHash(hash);
      voteEvidence.record(evidenceScope, "confirmed", isAMask);
      setVotingStep("complete");
      setStepMessage(`${label} published on-chain!`);
      addAlert(`${label} published on-chain!`, { timeout: 3000, type: "success" });
      return { success: true, txHash: hash };
    } catch (error) {
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
      setIsLoading(false);
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
        "confirmed"
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
    txHash,
    canPublishOnChain,
    onChainBlockedReason,
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
