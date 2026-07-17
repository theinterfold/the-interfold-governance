import { useState } from "react";
import { useRouter } from "next/router";
import { PUB_CHAIN } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { StagedProposalProcessorAbi } from "../artifacts/StagedProposalProcessor";
import { SppResultType, sppAddressFor } from "../utils/types";

import type { SppKind } from "../utils/types";

const VETO_STAGE_ID = 1;

/**
 * Vetoes an SPP proposal in the stage-1 veto window by reporting a Veto result.
 * Only meaningful when called from the stage-1 body address (the foundation) —
 * the SPP only counts reports from addresses in the stage configuration.
 */
export function useSppVeto(kind: SppKind, proposalId: bigint) {
  const { reload } = useRouter();
  const address = sppAddressFor(kind);
  const [isVetoing, setIsVetoing] = useState(false);

  const { writeContract, isConfirming, isConfirmed } = useTransactionManager({
    onSuccessMessage: "Proposal vetoed",
    onErrorMessage: "Could not veto the proposal",
    onSuccess() {
      setTimeout(() => reload(), 1000 * 2);
    },
    onError() {
      setIsVetoing(false);
    },
  });

  const vetoProposal = () => {
    setIsVetoing(true);

    writeContract({
      chainId: PUB_CHAIN.id,
      abi: StagedProposalProcessorAbi,
      address,
      functionName: "reportProposalResult",
      args: [proposalId, VETO_STAGE_ID, SppResultType.Veto, false],
    });
  };

  return {
    vetoProposal,
    isConfirming: isVetoing || isConfirming,
    isConfirmed,
  };
}
