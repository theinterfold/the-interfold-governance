import { useState } from "react";
import { useReadContract } from "wagmi";
import { useRouter } from "next/router";
import { PUB_CHAIN } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { StagedProposalProcessorAbi } from "../artifacts/StagedProposalProcessor";
import { sppAddressFor } from "../utils/types";

import type { SppKind } from "../utils/types";

/**
 * Advances an SPP proposal to the next stage. Advancing from the last (veto)
 * stage executes the proposal's actions on the DAO.
 */
export function useSppAdvance(kind: SppKind, proposalId: bigint, isLastStage: boolean) {
  const { reload } = useRouter();
  const address = sppAddressFor(kind);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const { data: canAdvance } = useReadContract({
    chainId: PUB_CHAIN.id,
    address,
    abi: StagedProposalProcessorAbi,
    functionName: "canProposalAdvance",
    args: [proposalId],
  });

  const { writeContract, isConfirming, isConfirmed } = useTransactionManager({
    onSuccessMessage: isLastStage ? "Proposal executed" : "Proposal advanced to the next stage",
    onSuccess() {
      setTimeout(() => reload(), 1000 * 2);
    },
    onErrorMessage: isLastStage ? "Could not execute the proposal" : "Could not advance the proposal",
    onError() {
      setIsAdvancing(false);
    },
  });

  const advanceProposal = () => {
    if (!canAdvance) return;

    setIsAdvancing(true);

    writeContract({
      chainId: PUB_CHAIN.id,
      abi: StagedProposalProcessorAbi,
      address,
      functionName: "advanceProposal",
      args: [proposalId],
    });
  };

  return {
    advanceProposal,
    canAdvance: !!canAdvance && !isConfirmed,
    isConfirming: isAdvancing || isConfirming,
    isConfirmed,
  };
}
