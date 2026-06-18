import { useAccount, useBlockNumber, useReadContract } from "wagmi";
import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { useEffect } from "react";
import { PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";

export function useCanVote(proposalId: bigint) {
  const { address } = useAccount();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { data: canVote, refetch: refreshCanVote } = useReadContract({
    address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
    abi: TokenVotingAbi,
    functionName: "canVote",
    // VoteOption.Yes (2) — only checks eligibility, not the chosen option
    args: [proposalId, address!, 2],
    query: { enabled: !!address },
  });

  useEffect(() => {
    refreshCanVote();
  }, [blockNumber, refreshCanVote]);

  return canVote;
}
