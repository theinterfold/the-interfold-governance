import { voteEvidence } from "../utils/voteEvidence";
import { chooseBallotWeight, reviewedVote, type BallotWeight } from "../utils/ballotWeight";
import { sendPreparedBallot } from "../utils/sendPreparedBallot";
import { usePreparedBallot } from "./usePreparedBallot";
import { preparedSenderError, readPreparedBallot, type PreparedBallot } from "../utils/preparedBallot";
import { prepareDemoBallot, sendPreparedDemoBallot, simulateDemoBallot } from "@/dev/simulation";
import { PUB_CHAIN, PUB_CRISP_SERVER_URL, PUB_CRISP_VOTING_PLUGIN_ADDRESS, PUB_TOKEN_ADDRESS } from "@/constants";
import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BallotSubmissionResult, PreparedVoteReceipt } from "../utils/ballotSubmission";
import { useAccount, useSignTypedData } from "wagmi";
import { CreditsMode } from "../utils/types";
import type { EligibleVoter, IRoundDetailsResponse, VoteData, VotingStep } from "../utils/types";
import { encodeSolidityProof, finishBallotProof, finishMaskProof, getZeroVote, getMaxVoteValue } from "@crisp-e3/sdk";
import { ensureCircuits } from "../utils/circuits";
import { iVotesAbi } from "../artifacts/iVotes";
import { publicClient } from "../utils/client";
import { useAlerts } from "@/context/Alerts";
import { crispSdk } from "../utils/crispSdk";
import { getRandomVoterToMask, selectVoterToMask } from "../utils/voters";
import {
  CensusMode,
  ballotTypedData,
  getBallotDigest,
  getCensusMode,
  getOnchainVotingPower,
  resolveCrispProgram,
} from "../utils/ballotDigest";
import { usePublishVote } from "./usePublishVote";
import { useCommitteeKeyCheck } from "./useCommitteeKeyCheck";

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
  e3Id: bigint,
  address: string,
  roundState: IRoundDetailsResponse,
  crispProgram?: `0x${string}`
) {
  const decimals = await publicClient.readContract({
    address: PUB_TOKEN_ADDRESS,
    abi: iVotesAbi,
    functionName: "decimals",
  });
  let adjustedBalance: bigint;

  if (crispProgram) {
    // An ONCHAIN round takes both the snapshot and the scaling from the contract, which then
    // verifies the proof against exactly that number. Reading it here — rather than repeating
    // the `getPastVotes` call and the `10 ** (decimals - 1)` division below — is what keeps the
    // prover and the verifier in agreement; a one-unit difference fails the proof with nothing
    // naming the cause.
    adjustedBalance = await getOnchainVotingPower(publicClient, crispProgram, e3Id, address as `0x${string}`);
  } else if (roundState.credit_mode === CreditsMode.CONSTANT && roundState.credits) {
    adjustedBalance = BigInt(roundState.credits);
  } else {
    // The voting token is timestamp-clocked (EIP-6372, CLOCK_MODE=timestamp), so
    // getPastVotes expects a *timestamp*, not a block number. The CRISP server snapshots
    // voting power at `start_time - 1`; we must query the exact same point or our leaf
    // won't match the server's merkle tree.
    const snapshotTimestamp = BigInt(roundState.start_time) - 1n;

    const balance = await publicClient.readContract({
      address: PUB_TOKEN_ADDRESS,
      abi: iVotesAbi,
      functionName: "getPastVotes",
      args: [address as `0x${string}`, snapshotTimestamp],
    });

    // Must mirror the CRISP server's scaling exactly (it keeps 1 decimal of precision:
    // balance / 10^(decimals-1)) or our vote won't match the server's merkle leaf. It also
    // keeps votes within the BFV per-choice encoding cap (2^33 - 1 for 3 options).
    adjustedBalance = balance / 10n ** BigInt(Math.max(0, decimals - 1));
  }

  return {
    available: adjustedBalance,
    decimals: roundState.credit_mode === CreditsMode.CONSTANT ? 0 : Math.min(decimals, 1),
  };
}

/**
 * State of the Crisp server
 */
interface CrispServerState {
  getRandomMaskTarget: () => Promise<string>;
  getMaskRecipients: () => Promise<EligibleVoter[]>;
  preparedBallot: PreparedBallot | null;
  preparedReceipt: PreparedVoteReceipt | null;
  changePreparedVote: () => void;
  getVoteWeight: (randomize: boolean) => Promise<BallotWeight>;
  prepareVote: (
    option: bigint,
    snapshotBlock: bigint,
    expiresAt: number,
    weight: BallotWeight
  ) => Promise<BallotSubmissionResult>;
  sendPreparedVote: () => Promise<BallotSubmissionResult>;
  discardPreparedVote: () => void;
  isLoading: boolean;
  error: string;
  postVote: (
    voteOption: bigint,
    e3Id: bigint,
    snapshotBlock: bigint,
    isAMask?: boolean,
    /** Send the vote yourself instead of handing it to the CRISP server to relay. */
    submitOnChain?: boolean,
    maskTarget?: string,
    weight?: BallotWeight
  ) => Promise<BallotSubmissionResult>;
  votingStep: VotingStep;
  lastActiveStep: VotingStep | null;
  stepMessage: string;
  txHash: string | null;
  /** The round currently satisfies every precondition `publishInput` enforces. */
  canPublishOnChain: boolean;
  /** Why the on-chain route is unavailable, when it is. */
  onChainBlockedReason?: string;
}

interface VoteResponse {
  status: string;
  tx_hash: string | null;
  message: string | null;
  is_vote_update: boolean | null;
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
  address: string;
}

/**
 * Hook to interact with Crisp server
 * @returns an error, a loading state and a function to cast votes
 */
export function useCrispServer(e3Id?: bigint): CrispServerState {
  const { address, chainId } = useAccount();
  const { addAlert } = useAlerts();
  const pending = usePreparedBallot(
    e3Id === undefined
      ? undefined
      : {
          chainId: PUB_CHAIN.id,
          plugin: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
          roundId: e3Id.toString(),
          demo: DESIGN_PREVIEW,
        }
  );

  // The on-chain route needs the round up front to check `publishInput`'s preconditions, so the
  // caller passes it here rather than only at vote time.
  const {
    publish: publishVoteOnChain,
    canPublish: canPublishOnChain,
    blockedReason: onChainBlockedReason,
  } = usePublishVote(e3Id);

  const resolveCommitteeKey = useCommitteeKeyCheck(e3Id);

  const [preparedReceipt, setPreparedReceipt] = useState<PreparedVoteReceipt | null>(null);
  useEffect(() => {
    setPreparedReceipt(null);
  }, [e3Id]);
  const [votingStep, setVotingStep] = useState<VotingStep>("idle");
  const [lastActiveStep, setLastActiveStep] = useState<VotingStep | null>(null);
  const [stepMessage, setStepMessage] = useState<string>("");

  const { signTypedDataAsync } = useSignTypedData();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const busy = useRef(false);
  const connectedAddress = useRef(address);
  connectedAddress.current = address;
  useEffect(() => {
    // Remove the previous preview's mask history; new results remain in memory only.
    try {
      for (const key of Object.keys(window.sessionStorage)) {
        if (key.startsWith("interfold:mask-receipts:v1:")) window.sessionStorage.removeItem(key);
      }
    } catch {
      /* Storage can be unavailable. */
    }
  }, []);

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
  const getMaskRecipients = useCallback(async () => {
    if (e3Id === undefined) throw new Error("This proposal is not ready for masking yet.");
    return getEligibleVoters(e3Id);
  }, [e3Id]);
  const getRandomMaskTarget = useCallback(async () => {
    if (e3Id === undefined) throw new Error("This proposal is not ready for masking yet.");
    const holders = await crispSdk.getEligibleAddresses(e3Id);
    return getRandomVoterToMask(
      holders.map((v) => ({ address: v.address, balance: BigInt(v.balance) })),
      address
    ).address;
  }, [e3Id, address]);
  const handleMask = async (
    e3Id: bigint,
    numOptions: string,
    /// Set for an ONCHAIN round: the program that will verify the mask.
    crispProgram?: `0x${string}`,
    target?: string
  ) => {
    const eligibleVoters = await getEligibleVoters(e3Id);

    if (!eligibleVoters || eligibleVoters.length === 0) {
      throw new Error("No eligible voters available for masking");
    }

    const voter = selectVoterToMask(eligibleVoters, target);

    const zeroVote = getZeroVote(Number.parseInt(numOptions));

    // A mask is still checked against public input 4, so its voting power has to be the number
    // the contract will supply for that slot — not the balance the server recorded. The two
    // usually coincide, because both scale by the token's decimals, but they diverge the moment a
    // round names an explicit divisor, and a mask that got it wrong would fail in the verifier.
    const balance = crispProgram
      ? await getOnchainVotingPower(publicClient, crispProgram, e3Id, voter.address as `0x${string}`)
      : voter.balance;

    return {
      voter,
      eligibleVoters,
      vote: zeroVote,
      balance,
      slotAddress: voter.address,
    };
  };

  const getVoteWeight = useCallback(
    async (randomize: boolean): Promise<BallotWeight> => {
      if (e3Id === undefined || !address) throw new Error("Connect your wallet before reviewing a ballot.");
      const roundState = (await crispSdk.getRoundStateLite(e3Id)) as unknown as IRoundDetailsResponse;
      const program = await resolveCrispProgram(publicClient, PUB_CRISP_VOTING_PLUGIN_ADDRESS, e3Id);
      const census = await getCensusMode(publicClient, program, e3Id);
      const { available, decimals } = await resolveVoteBalance(
        e3Id,
        address,
        roundState,
        census === CensusMode.ONCHAIN ? program : undefined
      );
      if (available > BigInt(getMaxVoteValue(Number(roundState.num_options)))) {
        throw new Error("Your voting power exceeds this round’s supported ballot size.");
      }
      return {
        roundId: e3Id,
        voter: address,
        available,
        counted: chooseBallotWeight(available, randomize),
        randomize,
        decimals,
      };
    },
    [e3Id, address]
  );

  const handleVote = async (
    e3Id: bigint,
    voteOption: bigint,
    numOptions: number,
    roundState: IRoundDetailsResponse,
    crispProgram: `0x${string}` | undefined,
    weight: BallotWeight | undefined
  ): Promise<VoteData> => {
    const { available } = await resolveVoteBalance(e3Id, address!, roundState, crispProgram);
    return {
      vote: reviewedVote(weight, available, e3Id, address!, Number(voteOption), numOptions),
      // Eligibility still proves the FULL balance. Only the encrypted choice is reduced.
      balance: available,
      slotAddress: address!,
    };
  };

  const postVote = async (
    voteOption: bigint,
    e3Id: bigint,
    snapshotBlock: bigint,
    isAMask: boolean = false,
    submitOnChain: boolean = false,
    maskTarget?: string,
    weight?: BallotWeight,
    prepareUntil?: number
  ): Promise<BallotSubmissionResult> => {
    if (busy.current) return { success: false, error: "A ballot is already being submitted." };
    busy.current = true;
    const submittingAddress = address;
    const assertSameWallet = () => {
      if (connectedAddress.current?.toLowerCase() !== submittingAddress?.toLowerCase()) {
        throw new Error("Your wallet changed. Review the ballot again before continuing.");
      }
    };
    // A retry starts a new receipt; never attach the preceding transaction to it.
    setError("");
    setTxHash(null);
    setVotingStep("idle");
    setLastActiveStep(null);
    setIsLoading(true);
    try {
      if (!address) {
        throw new Error("Connect your wallet before submitting a ballot.");
      }
      if (chainId !== PUB_CHAIN.id) throw new Error(`Switch your wallet to ${PUB_CHAIN.name} before signing.`);
      if (prepareUntil && pending.ballot) throw new Error("Send or discard your prepared ballot first.");
      if (prepareUntil && prepareUntil <= Date.now()) throw new Error("Voting has closed.");
      if (!isAMask && (!weight || weight.roundId !== e3Id || weight.voter.toLowerCase() !== address.toLowerCase())) {
        throw new Error("Review your voting power before submitting the ballot.");
      }
      if (DESIGN_PREVIEW) {
        if (!isAMask) {
          const round = await getRoundState(e3Id);
          const program = await resolveCrispProgram(publicClient, PUB_CRISP_VOTING_PLUGIN_ADDRESS, e3Id);
          await handleVote(e3Id, voteOption, Number(round.num_options), round, program, weight);
        }
        setError("");
        setVotingStep("signing");
        setLastActiveStep("signing");
        setStepMessage("Confirm in the demo wallet…");
        if (isAMask) selectVoterToMask(await getEligibleVoters(e3Id), maskTarget);
        assertSameWallet();
        if (prepareUntil) {
          await prepareDemoBallot(e3Id, voteOption);
          pending.save({
            version: 1,
            chainId: PUB_CHAIN.id,
            plugin: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
            roundId: e3Id.toString(),
            demo: true,
            voter: submittingAddress!,
            program: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
            encodedProof: "0xdeadbeef",
            demoOption: Number(voteOption),
            createdAt: Date.now(),
            expiresAt: prepareUntil,
          });
          setVotingStep("idle");
          setStepMessage("");
          return { success: true, txHash: null };
        }
        await simulateDemoBallot(e3Id, voteOption, isAMask, maskTarget, submittingAddress);
        setVotingStep("complete");
        setStepMessage(isAMask ? "Mask submitted" : "Vote submitted successfully!");
        addAlert(isAMask ? "Mask submitted" : "Vote submitted", {
          type: "success",
          description: "Completed in the local simulation.",
        });
        return { success: true, txHash: null };
      }
      addAlert(`${isAMask ? "Mask" : "Vote"} generation started! Please do not leave the current page.`, {
        timeout: 3000,
        type: "info",
      });

      const roundState = await getRoundState(e3Id);

      if (roundState.status !== "Active") {
        throw new Error("This round is not accepting votes. Please check the voting window.");
      }

      // Bail out before signing and proof generation when the chain stage or input window
      // already blocks on-chain publication. `canPublish` is false while the preconditions are
      // still being read too, in which case there is no reason to report yet.
      if (submitOnChain && !canPublishOnChain) {
        const reason =
          onChainBlockedReason ??
          "Still checking whether this round accepts on-chain votes. Please try again in a moment.";
        throw new Error(reason);
      }

      // The committee key comes from `CommitteePublished` logs, falling back to the CRISP server
      // only when the key was never published on-chain. Either way it is accepted only if its
      // recomputed BFV commitment matches the round's on-chain `committeePublicKey`, so nobody —
      // relayer or log spammer — can substitute a key they hold the secret for and decrypt the
      // ballot. Resolved BEFORE anything is encrypted to it.
      const resolved = await resolveCommitteeKey(toKeyBytes(roundState.committee_public_key));
      if (!resolved.key) {
        const reason = resolved.reason ?? "The committee public key could not be verified.";
        throw new Error(reason);
      }

      const publicKey = resolved.key;

      // Resolved before the ballot is built: an ONCHAIN round takes its weight from this contract
      // rather than from a census, so the program has to be known first.
      const crispProgram = await resolveCrispProgram(publicClient, PUB_CRISP_VOTING_PLUGIN_ADDRESS, e3Id);
      const censusMode = await getCensusMode(publicClient, crispProgram, e3Id);
      const isOnchainCensus = censusMode === CensusMode.ONCHAIN;

      let voteData;
      if (isAMask) {
        voteData = await handleMask(
          e3Id,
          roundState.num_options,
          isOnchainCensus ? crispProgram : undefined,
          maskTarget
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
      // encryption or proving. Loaded lazily so the ~3MB artifacts only download when voting.
      await ensureCircuits();

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
        // Step 3: Signing, now that there is a ciphertext to bind to.
        setVotingStep("signing");
        setLastActiveStep("signing");
        setStepMessage("Please sign your ballot in your wallet...");

        const { domain, types } = ballotTypedData(PUB_CHAIN.id, crispProgram);

        // `signTypedData`, not `signMessage`: `ballotDigest` returns an EIP-712 digest that a
        // wallet signs directly. `signMessage` would add the EIP-191 prefix and sign a different
        // one, and every ballot would fail looking like a bad signature.
        assertSameWallet();
        const signature = await signTypedDataAsync({
          account: submittingAddress,
          domain,
          types,
          primaryType: "Ballot",
          message: {
            e3Id,
            slot: voteData.slotAddress as `0x${string}`,
            ciphertextCommitment: prepared.ctCommitment,
          },
        });

        setVotingStep("generating_proof");
        setLastActiveStep("generating_proof");
        setStepMessage("Generating proof...");

        proof = await finishBallotProof(prepared, digest, signature);
      }

      const encodedProof = encodeSolidityProof(proof);

      if (prepareUntil) {
        pending.save({
          version: 1,
          chainId: PUB_CHAIN.id,
          plugin: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
          roundId: e3Id.toString(),
          demo: false,
          voter: submittingAddress!,
          program: crispProgram,
          encodedProof: encodedProof as `0x${string}`,
          createdAt: Date.now(),
          expiresAt: prepareUntil,
        });
        setVotingStep("idle");
        setStepMessage("");
        return { success: true, txHash: null };
      }

      const voteBody: BroadcastVoteRequest = {
        encoded_proof: encodedProof,
        address: submittingAddress as string,
        round_id: e3Id.toString(),
      };

      // Step 3: Broadcasting
      setVotingStep("broadcasting");
      setLastActiveStep("broadcasting");

      // Everything above this point is identical for both routes: the ballot is encrypted and
      // proven locally, and `encodedProof` is already the exact payload `publishInput` decodes.
      // The only difference is who sends the transaction — the voter, or the CRISP server acting
      // as a relayer.
      assertSameWallet();
      if (submitOnChain) {
        setStepMessage("Publishing your ballot on-chain...");

        const hash = await publishVoteOnChain(encodedProof as `0x${string}`, {
          account: submittingAddress!,
          expectedProgram: crispProgram,
        });
        setTxHash(hash);
        voteEvidence.record({ chainId: PUB_CHAIN.id, plugin: PUB_CRISP_VOTING_PLUGIN_ADDRESS, roundId: e3Id, voter: submittingAddress! }, "confirmed", isAMask);

        const onChainLabel = isAMask ? "Mask" : "Vote";
        setVotingStep("complete");
        setStepMessage(`${onChainLabel} published on-chain!`);
        addAlert(`${onChainLabel} published on-chain!`, { timeout: 3000, type: "success" });
        return { success: true, txHash: hash };
      }

      setStepMessage("Broadcasting ballot to the network...");

      const response = await fetch(`${PUB_CRISP_SERVER_URL}/voting/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(voteBody),
      });

      if (response.status !== 200) {
        throw new Error("Failed to broadcast ballot. Please try again.");
      }

      const voteResponse = (await response.json()) as VoteResponse;
      if (voteResponse.status !== "success") {
        throw new Error(voteResponse.message ?? "The ballot was not accepted. Please try again.");
      }

      if (voteResponse.tx_hash) {
        setTxHash(voteResponse.tx_hash);
      }

      voteEvidence.record({ chainId: PUB_CHAIN.id, plugin: PUB_CRISP_VOTING_PLUGIN_ADDRESS, roundId: e3Id, voter: submittingAddress! }, "submitted", isAMask);
      const label = isAMask ? "Mask" : voteResponse.is_vote_update ? "Vote update" : "Vote";

      setVotingStep("complete");
      setStepMessage(`${label} submitted successfully!`);

      addAlert(`${label} submitted successfully!`, { timeout: 3000, type: "success" });
      return { success: true, txHash: voteResponse.tx_hash ?? null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setError(errorMessage);
      setVotingStep("error");
      setStepMessage(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  };

  const prepareVote = (option: bigint, snapshotBlock: bigint, expiresAt: number, weight: BallotWeight) => {
    if (e3Id === undefined) return Promise.resolve({ success: false as const, error: "Proposal unavailable." });
    return postVote(option, e3Id, snapshotBlock, false, true, undefined, weight, expiresAt);
  };

  const sendPreparedVote = async (): Promise<BallotSubmissionResult> => {
    if (busy.current) return { success: false, error: "A ballot is already being submitted." };
    busy.current = true;
    setIsLoading(true);
    setError("");
    let ballot = pending.ballot;
    try {
      if (!ballot) throw new Error("No prepared ballot is available.");
      // Reload the saved payload, never rebuild it using the sender's address or voting power.
      ballot = ballot.transactionHash ? ballot : readPreparedBallot(window.localStorage, ballot);
      if (!ballot) throw new Error("The prepared ballot expired or was removed. Prepare it again.");
      const senderError = preparedSenderError(ballot, address, chainId);
      if (senderError) throw new Error(senderError);
      setVotingStep("broadcasting");
      setLastActiveStep("broadcasting");
      setStepMessage(
        ballot.transactionHash ? "Checking your transaction…" : "Confirm sending the signed vote in your wallet…"
      );
      let sender = ballot.transactionHash ? undefined : address;
      const hash = await sendPreparedBallot({
        ballot,
        sender: address,
        chainId,
        publish: publishVoteOnChain,
        receipt: async (hash) => {
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          sender = receipt.from;
          return receipt;
        },
        save: (saved) => {
          if (saved.transactionHash) setTxHash(saved.transactionHash);
          pending.save(saved);
        },
        remove: pending.remove,
        simulate: DESIGN_PREVIEW
          ? (saved, sender) =>
              sendPreparedDemoBallot(BigInt(saved.roundId), BigInt(saved.demoOption!), saved.voter, sender)
          : undefined,
      });
      setTxHash(hash);
      setVotingStep("complete");
      setStepMessage("Vote submitted for the signing wallet.");
      voteEvidence.record({ chainId: ballot.chainId, plugin: ballot.plugin, roundId: BigInt(ballot.roundId), voter: ballot.voter }, "confirmed");
      setPreparedReceipt({ voter: ballot.voter, sender, txHash: hash });
      addAlert("Vote submitted", { type: "success", description: "The vote counts for the wallet that signed it." });
      return { success: true, txHash: hash };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not send the prepared ballot.";
      setError(message);
      setVotingStep("error");
      setStepMessage(message);
      return { success: false, error: message };
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  };

  return {
    getVoteWeight,
    getMaskRecipients,
    preparedBallot: pending.ballot,
    preparedReceipt,
    changePreparedVote: () => setPreparedReceipt(null),
    prepareVote,
    sendPreparedVote,
    discardPreparedVote: () => {
      if (pending.ballot && !busy.current) {
        pending.remove(pending.ballot);
        setError("");
        setVotingStep("idle");
      }
    },
    getRandomMaskTarget,
    postVote,
    error,
    isLoading,
    votingStep,
    lastActiveStep,
    stepMessage,
    txHash,
    canPublishOnChain,
    onChainBlockedReason,
  };
}
