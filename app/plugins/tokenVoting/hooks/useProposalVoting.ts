import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { useRouter } from "next/router";
import { PUB_CHAIN, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";

export function useProposalVoting(proposalId: bigint) {
  const { reload } = useRouter();

  const {
    writeContract,
    status: votingStatus,
    isConfirming,
    isConfirmed,
  } = useTransactionManager({
    onSuccessMessage: "Vote registered",
    onSuccess: () => setTimeout(() => reload(), 1000 * 2),
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
  };
}
