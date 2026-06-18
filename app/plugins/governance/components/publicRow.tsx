import { ProposalStatus } from "@aragon/ods";
import { useProposal } from "@/plugins/tokenVoting/hooks/useProposal";
import { useProposalStatus } from "@/plugins/tokenVoting/hooks/useProposalVariantStatus";
import { unixTimestampToDate } from "@/plugins/crispVoting/utils/formatProposalDate";
import { ProposalRow, capitalize } from "./proposalRow";

const YES_COLOR = "#2f8a4f";
const NO_COLOR = "#a84932";
const ABSTAIN_COLOR = "#7a7d77";

export function PublicRow({ proposalId }: { proposalId: bigint }) {
  const { proposal, status } = useProposal(proposalId);
  const proposalStatus = useProposalStatus(proposal!);
  const href = `#/proposals/public/${proposalId}`;

  const loading = !proposal || status.proposalLoading || (!proposal?.title && !status.metadataError);
  if (loading) {
    return <ProposalRow href={href} kindLabel="Public" loading loadingMessage="Loading proposal…" />;
  }

  const { yes, no, abstain } = proposal.tally;
  const total = yes + no + abstain;
  const isActive = proposalStatus === ProposalStatus.ACTIVE;
  const endDate = Number(proposal.parameters.endDate) * 1000;
  const rightLabel =
    isActive && endDate > Date.now()
      ? `Ends ${unixTimestampToDate(Math.round(endDate / 1000))}`
      : capitalize(proposalStatus);

  const bars =
    total > 0n
      ? [
          { width: Number((yes * 10000n) / total) / 100, color: YES_COLOR },
          { width: Number((no * 10000n) / total) / 100, color: NO_COLOR },
          { width: Number((abstain * 10000n) / total) / 100, color: ABSTAIN_COLOR },
        ]
      : [];

  return (
    <ProposalRow
      href={href}
      kindLabel="Public"
      title={proposal.title}
      summary={proposal.summary}
      creator={proposal.creator}
      statusLabel={capitalize(proposalStatus)}
      statusClass={(proposalStatus ?? "").toString().toLowerCase()}
      rightLabel={rightLabel}
      bars={bars}
    />
  );
}
