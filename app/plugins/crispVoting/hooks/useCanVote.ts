import { useAccount, useBlockNumber, useReadContract } from "wagmi";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { iVotesAbi } from "../artifacts/iVotes";
import { useEffect } from "react";
import { PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";

import type { Address } from "viem";
import type { Proposal } from "../utils/types";

/**
 * The CRISP plugin no longer exposes an on-chain `canVote` (ballots are cast
 * off-chain via the CRISP server) — mirror its eligibility rule client-side:
 * the proposal must be open and the voter's snapshot voting power must clear
 * `minVoterVotingPower`.
 */
export function useCanVote(proposalId: bigint) {
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

  const { data: minVoterVotingPower } = useReadContract({
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "minVoterVotingPower",
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

  if (!address || !proposal || pastVotes === undefined || minVoterVotingPower === undefined) return undefined;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isOpen = !proposal.executed && proposal.parameters.startDate <= now && now < proposal.parameters.endDate;

  return isOpen && (pastVotes as bigint) > 0n && (pastVotes as bigint) >= (minVoterVotingPower as bigint);
}
