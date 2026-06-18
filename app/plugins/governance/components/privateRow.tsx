import { ProposalStatus } from "@aragon/ods";
import { useProposal } from "@/plugins/crispVoting/hooks/useProposal";
import { useProposalStatus } from "@/plugins/crispVoting/hooks/useProposalStatus";
import { unixTimestampToDate } from "@/plugins/crispVoting/utils/formatProposalDate";
import { ProposalRow, capitalize } from "./proposalRow";

// Interfold earth-tone palette (matches the CRISP vote card option colors)
const OPTION_COLORS = ["#2f8a4f", "#a84932", "#7a7d77", "#355a8a", "#8a6a40", "#5a4a8a", "#2f7a6a", "#9a7a30"];

export function PrivateRow({ proposalId }: { proposalId: bigint }) {
  const { proposal, totalVotingPower, status } = useProposal(proposalId);
  const proposalStatus = useProposalStatus(proposal!, totalVotingPower);
  const href = `#/proposals/private/${proposalId}`;

  const loading = !proposal || status.proposalLoading || (!proposal?.title && !status.metadataError);
  if (loading) {
    return <ProposalRow href={href} kindLabel="Private" loading loadingMessage="Loading proposal…" />;
  }

  const tally = Array.from(proposal.tally ?? []);
  const options = proposal.options ?? ["Yes", "No"];
  const totalVotes = tally.reduce((sum, count) => sum + (count ?? 0n), 0n);
  const isActive = proposalStatus === ProposalStatus.ACTIVE;
  const endDate = Number(proposal.parameters.endDate) * 1000;
  const rightLabel =
    isActive && endDate > Date.now()
      ? `Ends ${unixTimestampToDate(Math.round(endDate / 1000))}`
      : capitalize(proposalStatus);

  const bars =
    totalVotes > 0n
      ? options.map((_, i) => ({
          width: Number(((tally[i] ?? 0n) * 10000n) / totalVotes) / 100,
          color: OPTION_COLORS[i % OPTION_COLORS.length],
        }))
      : [];

  return (
    <ProposalRow
      href={href}
      kindLabel="Private"
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
