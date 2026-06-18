import { useAccount, useBlockNumber, useReadContract } from "wagmi";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { useEffect } from "react";
import { PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";

export function useCanVote(proposalId: bigint) {
  const { address } = useAccount();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { data: canVote, refetch: refreshCanVote } = useReadContract({
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "canVote",
    args: [BigInt(proposalId), address!, 1],
    query: { enabled: !!address },
  });

  useEffect(() => {
    refreshCanVote();
  }, [blockNumber, refreshCanVote]);

  return canVote;
}
