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

/** Final vote outcome requires a chain read made after the voting deadline. */
export function derivePublicProposalStatus(
  proposal: Proposal | null | undefined,
  nowMs: number,
  proposalReadAtMs?: number
): ProposalStatus | undefined {
  if (!proposal?.parameters || !proposal.tally) return undefined;
  if (proposal.executed) return ProposalStatus.EXECUTED;

  const startMs = Number(proposal.parameters.startDate) * 1000;
  const endMs = Number(proposal.parameters.endDate) * 1000;
  if (nowMs < startMs) return ProposalStatus.PENDING;
  if (nowMs < endMs) return ProposalStatus.ACTIVE;
  if (proposalReadAtMs === undefined || proposalReadAtMs < endMs || proposal.active) return ProposalStatus.PENDING;

  const { passed, lowTurnout } = computeOutcome(proposal);
  if (lowTurnout || !passed) return ProposalStatus.REJECTED;
  return proposal.actions.length ? ProposalStatus.EXECUTABLE : ProposalStatus.ACCEPTED;
}

export const useProposalStatus = (proposal: Proposal, nowMs = Date.now(), proposalReadAtMs?: number) =>
  derivePublicProposalStatus(proposal, nowMs, proposalReadAtMs);

export const useProposalVariantStatus = (proposal: Proposal, nowMs = Date.now(), proposalReadAtMs?: number) => {
  const status = derivePublicProposalStatus(proposal, nowMs, proposalReadAtMs);
  if (status === ProposalStatus.ACTIVE) return { variant: "info", label: "Active" };
  if (status === ProposalStatus.EXECUTED) return { variant: "primary", label: "Executed" };
  if (status === ProposalStatus.REJECTED) {
    const { lowTurnout } = computeOutcome(proposal);
    return { variant: "critical", label: lowTurnout ? "Rejected — low turnout" : "Rejected" };
  }
  if (status === ProposalStatus.EXECUTABLE || status === ProposalStatus.ACCEPTED) {
    return { variant: "success", label: "Executable" };
  }
  return { variant: "", label: status === ProposalStatus.PENDING ? "Pending" : "" };
};
