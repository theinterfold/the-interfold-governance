import { useAccount, useBlockNumber, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { iVotesAbi } from "../artifacts/iVotes";
import { useEffect } from "react";
import { PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { classifyVoteEligibility } from "../utils/voteEligibility";
import { getRoundEligibilityFloor } from "../utils/ballotDigest";
import { publicClient } from "../utils/client";

import type { Address } from "viem";
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
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { data: proposalData } = useReadContract({
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "getProposal",
    args: [proposalId],
  });
  const proposal = proposalData as Proposal | undefined;

  const { data: votingToken } = useReadContract({
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "getVotingToken",
  });

  // The round's floor, not the plugin's live `minVoterVotingPower`. The plugin raises a floor below
  // one ballot unit when it requests the round (1 wei becomes 0.1 FOLD), and `publishInput` refuses
  // anything under the raised value with `SlotNotEligible` — after the voter has signed and proven.
  // Fixed when the round is requested, so a later settings change cannot move it either.
  const e3Id = proposal?.e3Id;
  const { data: minimum } = useQuery({
    queryKey: ["crisp-round-floor", e3Id?.toString()],
    queryFn: () => getRoundEligibilityFloor(publicClient, PUB_CRISP_VOTING_PLUGIN_ADDRESS, e3Id!),
    enabled: e3Id !== undefined,
    staleTime: Infinity,
  });

  const snapshotBlock = proposal?.parameters?.snapshotBlock;

  const { data: pastVotes, refetch: refreshPastVotes } = useReadContract({
    address: votingToken as Address | undefined,
    abi: iVotesAbi,
    functionName: "getPastVotes",
    args: [address!, snapshotBlock!],
    query: { enabled: !!address && !!votingToken && snapshotBlock !== undefined },
  });

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
