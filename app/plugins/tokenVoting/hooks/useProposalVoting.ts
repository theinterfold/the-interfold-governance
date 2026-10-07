import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { useQueryClient } from "@tanstack/react-query";
import { PUB_CHAIN, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";

export function useProposalVoting(proposalId: bigint) {
  const queryClient = useQueryClient();

  const {
    writeContract,
    status: votingStatus,
    isConfirming,
    isConfirmed,
    error,
    hash,
  } = useTransactionManager({
    onSuccessMessage: "Vote registered",
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["readContract"] }),
    onErrorMessage: "Could not submit the vote",
  });

  const voteProposal = (voteOption: number, autoExecute: boolean = false) => {
    writeContract({
      chainId: PUB_CHAIN.id,
      abi: TokenVotingAbi,
      address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
      functionName: "vote",
      args: [proposalId, voteOption, autoExecute],
    });
  };

  return {
    voteProposal,
    status: votingStatus,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}
