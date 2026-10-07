import { ProposalReadingHeader } from "@/components/proposal/proposalReadingHeader";
import { ProposalStatus } from "@aragon/ods";
import type { Proposal } from "../../utils/types";
import { useProposalStatus } from "../../hooks/useProposalStatus";
import type { ReactNode } from "react";
import { ProposalCountdown } from "@/components/proposal/proposalCountdown";
import { bodyStatusLabel } from "@/plugins/governance/utils/statusBucket";
import { unixTimestampToDate } from "../../utils/formatProposalDate";

interface ProposalHeaderProps {
  proposal: Proposal;
  totalVotingPower?: bigint;
  /** The E3 round failed on-chain — the proposal was never decided. */
  e3Failed?: boolean;
  /** Whether the ciphernode committee has published its key. Until it has there is nothing to
   *  encrypt a ballot against, so the round is open on chain but not votable. */
  isCommitteeReady?: boolean;
}

const ProposalHeader: React.FC<ProposalHeaderProps> = ({ proposal, totalVotingPower, e3Failed, isCommitteeReady }) => {
  const { status: proposalStatus, quorumNotMet } = useProposalStatus(proposal, totalVotingPower, e3Failed);
  const statusLabel = bodyStatusLabel(proposalStatus, quorumNotMet);

  const isEmergency = proposal.parameters.startDate === 0n;
  const endDateIsInThePast = Number(proposal.parameters.endDate) * 1000 < Date.now();
  const hasNotStarted = !isEmergency && Number(proposal.parameters.startDate) * 1000 > Date.now();

  let timing: ReactNode;
  if (e3Failed) timing = "Round failed";
  else if (proposalStatus === ProposalStatus.ACCEPTED) timing = "Accepted";
  else if (proposalStatus === ProposalStatus.REJECTED) timing = statusLabel;
  else if (endDateIsInThePast) timing = "Voting closed";
  // Before the start, a countdown to the end answers the wrong question: the reader wants to know
  // when they can vote, and an end time alone implies voting is already open.
  else if (hasNotStarted) {
    timing = `Voting starts ${unixTimestampToDate(proposal.parameters.startDate)} · ends ${unixTimestampToDate(proposal.parameters.endDate)}`;
  }
  // "Forming committee" only once voting has actually opened. Before the start the protocol
  // deliberately sizes the gap to cover sortition and DKG, so a committee still forming is on
  // schedule, not late. After the start, an unpublished key IS the blocker and this is the honest
  // label.
  else if (!isCommitteeReady) timing = "Forming committee";
  else timing = <ProposalCountdown endMs={Number(proposal.parameters.endDate) * 1000} />;

  return (
    <ProposalReadingHeader
      title={proposal.title}
      summary={proposal.summary}
      creator={proposal.creator}
      status={proposalStatus}
      statusLabel={statusLabel}
      kind="Secret ballot"
      timing={timing}
      badges={
        <>
          {/* "Rejected" on its own reads as "the DAO voted this down". A failed round was never
              decided at all — the encrypted vote could not complete. */}
          {e3Failed && <span className="badge failed">Round failed</span>}
          {isEmergency && <span className="badge failed">Emergency</span>}
        </>
      }
    />
  );
};

export default ProposalHeader;
