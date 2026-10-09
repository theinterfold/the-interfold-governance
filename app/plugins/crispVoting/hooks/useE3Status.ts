import { useEffect } from "react";
import { useReadContract } from "wagmi";
import { parseAbi } from "viem";
import type { Address } from "viem";
import { interfoldViewsAbi } from "../artifacts/interfoldViews";
import { PUB_CHAIN_ID } from "@/constants";
import { usePrivatePair } from "./usePrivatePair";

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
  const { body } = usePrivatePair();
  const active = enabled && e3Id !== undefined;

  const { data: interfold } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: body,
    abi: pluginAbi,
    functionName: "interfold",
    query: { enabled: active },
  });

  const { data: stageRaw } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: interfold as Address | undefined,
    abi: interfoldViewsAbi,
    functionName: "getE3Stage",
    args: [e3Id ?? 0n],
    query: { enabled: active && !!interfold, refetchInterval: 15_000 },
  });

  const { data: round } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: interfold as Address | undefined,
    abi: interfoldViewsAbi,
    functionName: "getE3",
    args: [e3Id ?? 0n],
    query: { enabled: active && !!interfold, refetchInterval: 15_000 },
  });

  const stage = stageRaw === undefined ? undefined : (Number(stageRaw) as E3Stage);
  const isFailed = stage === E3Stage.Failed;

  const { data: reasonRaw } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: interfold as Address | undefined,
    abi: interfoldViewsAbi,
    functionName: "getFailureReason",
    args: [e3Id ?? 0n],
    query: { enabled: active && !!interfold && isFailed },
  });

  const failureReason = reasonRaw === undefined ? undefined : (Number(reasonRaw) as E3FailureReason);

  // A round does not mark itself failed. `markE3Failed` is a permissionless transaction someone
  // has to send once a stage deadline passes, so a round whose DKG timed out days ago still reads
  // as `CommitteeFinalized` until then — alive on-chain, and dead in every way that matters.
  // `checkFailureCondition` is what Interfold would act on, so it is the honest signal to show.
  const { data: pending, refetch: refetchFailureCondition } = useReadContract({
    chainId: PUB_CHAIN_ID,
    address: interfold as Address | undefined,
    abi: interfoldViewsAbi,
    functionName: "checkFailureCondition",
    args: [e3Id ?? 0n],
    query: { enabled: active && !!interfold && !isFailed && stage !== E3Stage.Complete, refetchInterval: 15_000 },
  });

  const [canFail, pendingReasonRaw] = (pending as readonly [boolean, number] | undefined) ?? [];

  useEffect(() => {
    if (active && interfold && !isFailed && stage !== E3Stage.Complete) void refetchFailureCondition();
  }, [active, interfold, isFailed, stage, refetchFailureCondition]);

  // A newly published result must win over an older, cached timeout read.
  const isFailurePending = active && !isFailed && stage !== E3Stage.Complete && canFail === true;
  const isDead = active && (isFailed || isFailurePending);

  return {
    stage,
    inputStartMs: round ? Number(round.inputWindow[0]) * 1000 : undefined,
    inputEndMs: round ? Number(round.inputWindow[1]) * 1000 : undefined,
    isFailed,
    failureReason: isFailed
      ? failureReason
      : pendingReasonRaw === undefined
        ? undefined
        : (Number(pendingReasonRaw) as E3FailureReason),
    /** The failure condition is met but nobody has sent `markE3Failed` yet. */
    isFailurePending,
    isDead,
  };
}
