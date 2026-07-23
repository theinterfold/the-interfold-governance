import { useState } from "react";
import { useRouter } from "next/router";
import { PUB_CHAIN } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { StagedProposalProcessorAbi } from "../artifacts/StagedProposalProcessor";
import { SppResultType, sppAddressFor } from "../utils/types";

import type { SppKind } from "../utils/types";

const VETO_STAGE_ID = 1;

/**
 * Reports the foundation's stage-1 result on an SPP proposal — a Veto (opt-out
 * mode) or an Approval (opt-in mode), depending on how the stage is wired.
 * Only meaningful when called from the stage-1 body address (the foundation) —
 * the SPP only counts reports from addresses in the stage configuration.
 */
export function useSppVeto(kind: SppKind, proposalId: bigint) {
  const { reload } = useRouter();
  const address = sppAddressFor(kind);
  const [isReporting, setIsReporting] = useState(false);
  const [resultLabel, setResultLabel] = useState<"vetoed" | "approved">("vetoed");

  const { writeContract, isConfirming, isConfirmed } = useTransactionManager({
    onSuccessMessage: resultLabel === "vetoed" ? "Proposal vetoed" : "Proposal approved",
    onErrorMessage: resultLabel === "vetoed" ? "Could not veto the proposal" : "Could not approve the proposal",
    onSuccess() {
      setTimeout(() => reload(), 1000 * 2);
    },
    onError() {
      setIsReporting(false);
    },
  });

  const report = (resultType: SppResultType) => {
    setIsReporting(true);

    writeContract({
      chainId: PUB_CHAIN.id,
      abi: StagedProposalProcessorAbi,
      address,
      functionName: "reportProposalResult",
      args: [proposalId, VETO_STAGE_ID, resultType, false],
    });
  };

  const vetoProposal = () => {
    setResultLabel("vetoed");
    report(SppResultType.Veto);
  };

  const approveProposal = () => {
    setResultLabel("approved");
    report(SppResultType.Approval);
  };

  return {
    vetoProposal,
    approveProposal,
    isConfirming: isReporting || isConfirming,
    isConfirmed,
  };
}
