import { useState, useEffect } from "react";
import { ProposalStatus } from "@aragon/ods";
import { RATIO_BASE, type Proposal } from "../utils/types";

/**
 * Derives the proposal outcome from the v1.4 tally + parameters.
 *
 * In TokenVoting v1.4 `parameters.minVotingPower` is already an *absolute*
 * voting power (minParticipation applied on-chain), and `supportThreshold`
 * is a ppm ratio (out of RATIO_BASE). minApproval is assumed 0 (the common
 * case); proposals using a non-zero minApproval should rely on the on-chain
 * `canExecute` for the final gate, which the execute button already does.
 */
function computeOutcome(proposal: Proposal): {
  passed: boolean;
  lowTurnout: boolean;
} {
  const { yes, no, abstain } = proposal.tally;
  const totalVotes = yes + no + abstain;
  const yesNo = yes + no;

  const lowTurnout = totalVotes < proposal.parameters.minVotingPower;
  const supportReached = yesNo > 0n && BigInt(RATIO_BASE) * yes > BigInt(proposal.parameters.supportThreshold) * yesNo;

  return { passed: supportReached && !lowTurnout, lowTurnout };
}

export const useProposalStatus = (proposal: Proposal) => {
  const [status, setStatus] = useState<ProposalStatus>();

  useEffect(() => {
    if (!proposal || !proposal.parameters || !proposal.tally) return;

    if (proposal.active) {
      setStatus(ProposalStatus.ACTIVE);
    } else if (proposal.executed) {
      setStatus(ProposalStatus.EXECUTED);
    } else {
      const { passed, lowTurnout } = computeOutcome(proposal);
      if (lowTurnout) setStatus(ProposalStatus.FAILED);
      else if (passed) setStatus(proposal.actions.length ? ProposalStatus.EXECUTABLE : ProposalStatus.ACCEPTED);
      else setStatus(ProposalStatus.REJECTED);
    }
  }, [proposal?.tally, proposal?.active, proposal?.executed, proposal?.parameters]);

  return status;
};

export const useProposalVariantStatus = (proposal: Proposal) => {
  const [status, setStatus] = useState({ variant: "", label: "" });

  useEffect(() => {
    if (!proposal || !proposal.parameters || !proposal.tally) return;

    if (proposal.active) {
      setStatus({ variant: "info", label: "Active" });
    } else if (proposal.executed) {
      setStatus({ variant: "primary", label: "Executed" });
    } else {
      const { passed, lowTurnout } = computeOutcome(proposal);
      if (lowTurnout) setStatus({ variant: "critical", label: "Low turnout" });
      else if (passed) setStatus({ variant: "success", label: "Executable" });
      else setStatus({ variant: "critical", label: "Defeated" });
    }
  }, [proposal?.tally, proposal?.active, proposal?.executed, proposal?.parameters]);

  return status;
};
