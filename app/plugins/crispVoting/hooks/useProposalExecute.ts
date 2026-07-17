import { useState } from "react";
import { useReadContract } from "wagmi";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { useRouter } from "next/router";
import { PUB_CHAIN, PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { DaoAbi } from "@/artifacts/DAO.sol";

export function useProposalExecute(proposalId: bigint) {
  const { reload } = useRouter();
  const [isExecuting, setIsExecuting] = useState(false);

  const {
    data: canExecute,
    isError: isCanVoteError,
    isLoading: isCanVoteLoading,
  } = useReadContract({
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    chainId: PUB_CHAIN.id,
    functionName: "canExecute",
    args: [BigInt(proposalId)],
  });

  // Executing the sub-proposal on the body reports the approval to the SPP
  // (tryAdvance) — it advances the staged proposal to the veto stage rather
  // than executing anything on the DAO.
  const { writeContract, isConfirming, isConfirmed } = useTransactionManager({
    onSuccessMessage: "Result submitted — proposal advanced to the veto stage",
    onSuccess() {
      setTimeout(() => reload(), 1000 * 2);
    },
    onErrorMessage: "Could not submit the voting result",
    onErrorDescription: "The result may have already been reported to the staged process",
    onError() {
      setIsExecuting(false);
    },
  });

  const executeProposal = () => {
    if (!canExecute) return;
    else if (typeof proposalId === "undefined") return;

    setIsExecuting(true);

    writeContract({
      chainId: PUB_CHAIN.id,
      abi: CrispVotingAbi.concat(DaoAbi as any),
      address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
      functionName: "execute",
      args: [BigInt(proposalId)],
    });
  };

  return {
    executeProposal,
    canExecute: !isCanVoteError && !isCanVoteLoading && !isConfirmed && !!canExecute,
    isConfirming: isExecuting || isConfirming,
    isConfirmed,
  };
}
