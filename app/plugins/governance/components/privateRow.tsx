import { ProposalStatus } from "@aragon/ods";
import { useProposal } from "@/plugins/crispVoting/hooks/useProposal";
import { useProposalStatus } from "@/plugins/crispVoting/hooks/useProposalStatus";
import { unixTimestampToDate } from "@/plugins/crispVoting/utils/formatProposalDate";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { getSppStatusOverride } from "@/plugins/spp/utils/status";
import { ProposalRow, capitalize } from "./proposalRow";

// Interfold earth-tone palette (matches the CRISP vote card option colors)
const OPTION_COLORS = ["#2f8a4f", "#a84932", "#7a7d77", "#355a8a", "#8a6a40", "#5a4a8a", "#2f7a6a", "#9a7a30"];

/** `proposalId` is the SPP (staged process) proposal id; the CRISP sub-proposal id is resolved on-chain. */
export function PrivateRow({ proposalId }: { proposalId: bigint }) {
  const spp = useSppProposal("private", proposalId);
  const href = `#/proposals/private/${proposalId}`;

  if (spp.subProposalFailed) {
    return <ProposalRow href={href} kindLabel="Private" loading loadingMessage="Sub-proposal creation failed" />;
  }
  if (spp.subProposalId === undefined) {
    return <ProposalRow href={href} kindLabel="Private" loading loadingMessage="Loading proposal…" />;
  }

  return (
    <PrivateRowBody
      href={href}
      subProposalId={spp.subProposalId}
      metadataUri={spp.metadataUri}
      creator={spp.creator}
      spp={spp}
    />
  );
}

function PrivateRowBody({
  href,
  subProposalId,
  metadataUri,
  creator,
  spp,
}: {
  href: string;
  subProposalId: bigint;
  metadataUri?: string;
  creator?: string;
  spp: ReturnType<typeof useSppProposal>;
}) {
  const { proposal, totalVotingPower, status } = useProposal(subProposalId, { metadataUri, creator });
  const proposalStatus = useProposalStatus(proposal!, totalVotingPower);
  const sppOverride = getSppStatusOverride(spp.proposal, spp.state, spp.vetoTally, spp.vetoStage);

  const loading = !proposal || status.proposalLoading || (!proposal?.title && !status.metadataError);
  if (loading) {
    return <ProposalRow href={href} kindLabel="Private" loading loadingMessage="Loading proposal…" />;
  }

  const tally = Array.from(proposal.tally ?? []);
  const options = proposal.options ?? ["Yes", "No"];
  const totalVotes = tally.reduce((sum, count) => sum + (count ?? 0n), 0n);
  const isActive = !sppOverride && proposalStatus === ProposalStatus.ACTIVE;
  const endDate = Number(proposal.parameters.endDate) * 1000;
  const statusLabel = sppOverride?.label ?? capitalize(proposalStatus);
  const statusClass = sppOverride?.className ?? (proposalStatus ?? "").toString().toLowerCase();
  const rightLabel =
    isActive && endDate > Date.now() ? `Ends ${unixTimestampToDate(Math.round(endDate / 1000))}` : statusLabel;

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
      statusLabel={statusLabel}
      statusClass={statusClass}
      rightLabel={rightLabel}
      bars={bars}
    />
  );
}
