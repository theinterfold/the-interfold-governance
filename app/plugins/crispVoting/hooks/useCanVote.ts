import { useAccount, useBlockNumber, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { useSnapshotVotingPower } from "@/hooks/useSnapshotVotingPower";
import { useEffect } from "react";
import { usePrivatePair } from "./usePrivatePair";
import { classifyVoteEligibility } from "../utils/voteEligibility";
import { getRoundEligibilityFloor } from "../utils/ballotDigest";
import { publicClient } from "../utils/client";

import type { Proposal } from "../utils/types";
import type { CanVoteResult } from "../utils/voteEligibility";

/**
 * The CRISP plugin no longer exposes an on-chain `canVote` (ballots are cast
 * off-chain via the CRISP server) — mirror its eligibility rule client-side:
 * the proposal must be open and the voter's snapshot voting power must clear the floor the CRISP
 * program enforces for the round.
 *
 * Returns the REASON alongside the verdict. A bare boolean cannot distinguish "you hold no
 * voting power" from "voting opens in 25 minutes", and the UI has to say which.
 */
export function useCanVote(proposalId: bigint): CanVoteResult {
  const { address } = useAccount();
  const { body } = usePrivatePair();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { data: proposalData } = useReadContract({
    address: body,
    abi: CrispVotingAbi,
    functionName: "getProposal",
    args: [proposalId],
  });
  const proposal = proposalData as Proposal | undefined;

  // The round's floor, not the plugin's live `minVoterVotingPower`. The plugin raises a floor below
  // one ballot unit when it requests the round (1 wei becomes 0.1 FOLD), and `publishInput` refuses
  // anything under the raised value with `SlotNotEligible` — after the voter has signed and proven.
  // Fixed when the round is requested, so a later settings change cannot move it either.
  const e3Id = proposal?.e3Id;
  const { data: minimum } = useQuery({
    queryKey: ["crisp-round-floor", body, e3Id?.toString()],
    queryFn: () => getRoundEligibilityFloor(publicClient, body, e3Id!),
    enabled: e3Id !== undefined,
    staleTime: Infinity,
  });

  const snapshotBlock = proposal?.parameters?.snapshotBlock;

  // The voting token comes from `useVotingToken` (the plugin, with the configured source as a
  // fallback), and the read is pinned to the proposal's snapshot.
  const { votingPower: pastVotes, refetch: refreshPastVotes } = useSnapshotVotingPower(body, snapshotBlock);

  useEffect(() => {
    refreshPastVotes();
  }, [blockNumber, refreshPastVotes]);

  if (!address) {
    return {
      canVote: false,
      reason: "not-connected",
      message: "Connect a wallet to vote on this proposal.",
      isTimingOnly: false,
    };
  }

  // Still loading: report `undefined` so callers can stay quiet rather than flashing a wrong
  // explanation between renders.
  if (!proposal || pastVotes === undefined || minimum === undefined) {
    return { canVote: undefined, reason: undefined, message: undefined, isTimingOnly: false };
  }

  return classifyVoteEligibility({
    executed: proposal.executed,
    startDate: proposal.parameters.startDate,
    endDate: proposal.parameters.endDate,
    snapshot: proposal.parameters.snapshotBlock,
    now: BigInt(Math.floor(Date.now() / 1000)),
    votes: pastVotes as bigint,
    minimum,
  });
}
