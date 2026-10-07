import { ProposalStatus } from "@aragon/ods";
import type { Proposal } from "../../utils/types";
import { useProposalStatus } from "../../hooks/useProposalVariantStatus";
import { ProposalReadingHeader } from "@/components/proposal/proposalReadingHeader";
import { ProposalCountdown } from "@/components/proposal/proposalCountdown";
import type { ReactNode } from "react";
import type { ProposalPresentation } from "@/plugins/governance/utils/proposalPresentation";

const ProposalHeader = ({ proposal, presentation }: { proposal: Proposal; presentation?: ProposalPresentation }) => {
  const proposalStatus = useProposalStatus(proposal);
  const endDateIsInThePast = Number(proposal.parameters.endDate) * 1000 < Date.now();
  let timing: ReactNode;
  if (presentation && !presentation.votingOpen) timing = presentation.timing;
  else if (proposalStatus === ProposalStatus.ACCEPTED) timing = "The proposal has been accepted";
  else if (proposalStatus === ProposalStatus.REJECTED) timing = "The proposal has been rejected";
  else if (endDateIsInThePast) timing = "The voting period is over";
  else timing = <ProposalCountdown endMs={Number(proposal.parameters.endDate) * 1000} />;

  return (
    <ProposalReadingHeader
      title={proposal.title}
      summary={proposal.summary}
      creator={proposal.creator}
      status={presentation?.label ?? proposalStatus}
      statusClass={presentation?.className}
      kind="Transparent fallback"
      timing={timing}
    />
  );
};

export default ProposalHeader;
