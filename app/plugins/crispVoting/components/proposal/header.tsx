import { ProposalReadingHeader } from "@/components/proposal/proposalReadingHeader";
import { ProposalStatus } from "@aragon/ods";
import type { Proposal } from "../../utils/types";
import { useProposalStatus } from "../../hooks/useProposalStatus";
import type { ReactNode } from "react";
import { ProposalCountdown } from "@/components/proposal/proposalCountdown";
import type { ProposalPresentation } from "@/plugins/governance/utils/proposalPresentation";

interface ProposalHeaderProps {
  proposal: Proposal;
  totalVotingPower?: bigint;
  /** The E3 round failed on-chain — the proposal was never decided. */
  e3Failed?: boolean;
  /** Whether the ciphernode committee has published its key. Until it has there is nothing to
   *  encrypt a ballot against, so the round is open on chain but not votable. */
  isCommitteeReady?: boolean;
  presentation?: ProposalPresentation;
}

const ProposalHeader: React.FC<ProposalHeaderProps> = ({
  proposal,
  totalVotingPower,
  e3Failed,
  isCommitteeReady,
  presentation,
}) => {
  const proposalStatus = useProposalStatus(proposal, totalVotingPower, e3Failed);

  const isEmergency = proposal.parameters.startDate === 0n;
  const endDateIsInThePast = Number(proposal.parameters.endDate) * 1000 < Date.now();

  let endLabel: ReactNode;
  if (presentation && !presentation.votingOpen) endLabel = presentation.timing;
  else if (e3Failed) endLabel = "Round failed";
  else if (proposalStatus === ProposalStatus.ACCEPTED) endLabel = "Accepted";
  else if (proposalStatus === ProposalStatus.REJECTED) endLabel = "Rejected";
  else if (endDateIsInThePast) endLabel = "Voting closed";
  // A countdown promises there is something to do before it runs out. Until the committee
  // publishes its key there is no key to encrypt against, so the round is open on chain and
  // unvotable in practice — and the vote panel below already says exactly that. Checked after the
  // closed cases: a finished round is not "forming", it is over.
  else if (!isCommitteeReady) endLabel = "Forming committee";
  else endLabel = <ProposalCountdown endMs={Number(proposal.parameters.endDate) * 1000} />;

  return (
    <ProposalReadingHeader
      title={proposal.title}
      summary={proposal.summary}
      creator={proposal.creator}
      status={presentation?.label ?? proposalStatus}
      statusClass={presentation?.className}
      kind="Secret ballot"
      timing={endLabel}
      badges={<>{isEmergency && <span className="badge failed">Emergency</span>}</>}
    />
  );
};

export default ProposalHeader;
