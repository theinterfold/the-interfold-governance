import { ProposalStatus } from "@aragon/ods";
import type { Proposal } from "../../utils/types";
import { useProposalStatus } from "../../hooks/useProposalVariantStatus";
import { ProposalReadingHeader } from "@/components/proposal/proposalReadingHeader";
import { ProposalCountdown } from "@/components/proposal/proposalCountdown";
import { bodyStatusLabel } from "@/plugins/governance/utils/statusBucket";
import type { ReactNode } from "react";

const ProposalHeader = ({ proposal }: { proposal: Proposal }) => {
  const { status: proposalStatus, quorumNotMet } = useProposalStatus(proposal);
  const endDateIsInThePast = Number(proposal.parameters.endDate) * 1000 < Date.now();
  let timing: ReactNode;
  if (proposalStatus === ProposalStatus.ACCEPTED) timing = "The proposal has been accepted";
  else if (proposalStatus === ProposalStatus.REJECTED)
    timing = quorumNotMet ? "The proposal did not meet quorum" : "The proposal has been rejected";
  else if (endDateIsInThePast) timing = "The voting period is over";
  else timing = <ProposalCountdown endMs={Number(proposal.parameters.endDate) * 1000} />;

  return (
    <ProposalReadingHeader
      title={proposal.title}
      summary={proposal.summary}
      creator={proposal.creator}
      status={proposalStatus}
      statusLabel={bodyStatusLabel(proposalStatus, quorumNotMet)}
      kind="Transparent fallback"
      timing={timing}
    />
  );
};

export default ProposalHeader;
