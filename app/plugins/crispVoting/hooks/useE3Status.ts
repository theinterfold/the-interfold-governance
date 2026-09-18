import { useReadContract } from "wagmi";
import { parseAbi } from "viem";
import type { Address } from "viem";
import { PUB_CHAIN_ID, PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";

/** Lifecycle stages of an E3 computation (mirrors IInterfold.E3Stage). */
export enum E3Stage {
  None,
  Requested,
  CommitteeFinalized,
  KeyPublished,
  CiphertextReady,
  Complete,
  Failed,
}

/** Reasons an E3 failed (mirrors IInterfold.FailureReason). */
export enum E3FailureReason {
  None,
  CommitteeFormationTimeout,
  InsufficientCommitteeMembers,
  DKGTimeout,
  DKGInvalidShares,
  NoInputsReceived,
  ComputeTimeout,
  ComputeProviderExpired,
  ComputeProviderFailed,
  RequesterCancelled,
  DecryptionTimeout,
  DecryptionInvalidShares,
  VerificationFailed,
}

const pluginAbi = parseAbi(["function interfold() view returns (address)"]);
const interfoldAbi = parseAbi([
  "struct E3 { uint256 seed; uint8 committeeSize; uint256 requestBlock; uint256[2] inputWindow; bytes32 encryptionSchemeId; address e3Program; uint8 paramSet; bytes customParams; address decryptionVerifier; address pkVerifier; bytes32 committeePublicKey; bytes32 ciphertextOutput; bytes plaintextOutput; address requester; bool proofAggregationEnabled; }",
  "function getE3Stage(uint256 e3Id) view returns (uint8)",
  "function getE3(uint256 e3Id) view returns (E3 memory e3)",
  "function getFailureReason(uint256 e3Id) view returns (uint8)",
  "function checkFailureCondition(uint256 e3Id) view returns (bool canFail, uint8 reason)",
]);

/** Human-readable description of an E3 failure reason. */
export function describeE3Failure(reason: E3FailureReason | undefined): string {
  switch (reason) {
    case E3FailureReason.CommitteeFormationTimeout:
      return "The voting committee could not be formed in time.";
    case E3FailureReason.InsufficientCommitteeMembers:
      return "Not enough ciphernodes were available to form the voting committee.";
    case E3FailureReason.DKGTimeout:
      return "The committee timed out during distributed key generation (DKG).";
    case E3FailureReason.DKGInvalidShares:
      return "The committee produced invalid key shares during distributed key generation (DKG).";
    case E3FailureReason.NoInputsReceived:
      return "No votes were received before the input window closed.";
    case E3FailureReason.ComputeTimeout:
    case E3FailureReason.ComputeProviderExpired:
    case E3FailureReason.ComputeProviderFailed:
      return "The compute provider failed to produce a result.";
    case E3FailureReason.DecryptionTimeout:
    case E3FailureReason.DecryptionInvalidShares:
      return "The committee failed to decrypt the result.";
    case E3FailureReason.VerificationFailed:
      return "The result could not be verified.";
    case E3FailureReason.RequesterCancelled:
      return "The request was cancelled.";
    default:
      return "The encrypted vote round failed and could not be tallied.";
  }
}

/**
 * Reads the on-chain E3 lifecycle stage for a proposal's round. Used as a fallback
 * when the CRISP server can't return a usable round state: the Interfold contract is
 * the authoritative source for whether a round has failed (e.g. the committee couldn't
 * be formed or DKG timed out). Gate with `enabled` so a terminal round (tallied) skips
 * these reads.
 */
export function useE3Status(e3Id: bigint | undefined, enabled = true) {
  const active = enabled && e3Id !== undefined;

  const { data: interfold } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: pluginAbi,
    functionName: "interfold",
    query: { enabled: active },
  });

  const { data: stageRaw } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: interfold as Address | undefined,
    abi: interfoldAbi,
    functionName: "getE3Stage",
    args: [e3Id ?? 0n],
    query: { enabled: active && !!interfold },
  });

  const stage = stageRaw === undefined ? undefined : (Number(stageRaw) as E3Stage);
  const isFailed = stage === E3Stage.Failed;

  const { data: reasonRaw } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: interfold as Address | undefined,
    abi: interfoldAbi,
    functionName: "getFailureReason",
    args: [e3Id ?? 0n],
    query: { enabled: active && !!interfold && isFailed },
  });

  const failureReason = reasonRaw === undefined ? undefined : (Number(reasonRaw) as E3FailureReason);

  // A round does not mark itself failed. `markE3Failed` is a permissionless transaction someone
  // has to send once a stage deadline passes, so a round whose DKG timed out days ago still reads
  // as `CommitteeFinalized` until then — alive on-chain, and dead in every way that matters.
  // `checkFailureCondition` is what Interfold would act on, so it is the honest signal to show.
  const { data: pending } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: interfold as Address | undefined,
    abi: interfoldAbi,
    functionName: "checkFailureCondition",
    args: [e3Id ?? 0n],
    query: { enabled: active && !!interfold && !isFailed },
  });

  const [canFail, pendingReasonRaw] = (pending as readonly [boolean, number] | undefined) ?? [];

  /**
   * The input window's close is when the tally is scheduled, NOT when voting closes.
   *
   * Voting ends at the proposal's `endDate`, but the round stays open afterwards so every ballot
   * can be published to Avail and finalized by the VectorX bridge. The server only attempts the
   * tally once this deadline passes. Without showing it, a round sits visibly idle for hours
   * between "voting closed" and any result, which reads as a stall.
   */
  const { data: e3 } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: interfold as Address | undefined,
    abi: interfoldAbi,
    functionName: "getE3",
    args: [e3Id ?? 0n],
    query: { enabled: active && !!interfold && !isFailed },
  });

  const inputWindow = (e3 as { inputWindow?: readonly [bigint, bigint] } | undefined)?.inputWindow;
  const inputDeadline = inputWindow?.[1];

  /** Terminal either way: the round can never produce a tally. */
  const isDead = isFailed || canFail === true;

  return {
    stage,
    isFailed,
    failureReason: isFailed
      ? failureReason
      : pendingReasonRaw === undefined
        ? undefined
        : (Number(pendingReasonRaw) as E3FailureReason),
    /** The failure condition is met but nobody has sent `markE3Failed` yet. */
    isFailurePending: !isFailed && canFail === true,
    isDead,
    /**
     * Unix seconds when the input window closes — the moment the tally becomes due. Undefined
     * while the read is in flight or for a round already marked failed.
     */
    inputDeadline,
  };
}
