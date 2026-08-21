import { useEffect } from "react";
import { ProposalStatus } from "@aragon/ods";
import { useProposal } from "@/plugins/crispVoting/hooks/useProposal";
import { useProposalStatus } from "@/plugins/crispVoting/hooks/useProposalStatus";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { getSppStatusOverride } from "@/plugins/spp/utils/status";
import { statusBucketOf } from "../utils/statusBucket";
import { ProposalRow, capitalize, rowTimingLabel } from "./proposalRow";

import type { StatusBucket } from "../utils/statusBucket";

// Interfold earth-tone palette (matches the CRISP vote card option colors)
const OPTION_COLORS = ["#2f8a4f", "#a84932", "#7a7d77", "#355a8a", "#8a6a40", "#5a4a8a", "#2f7a6a", "#9a7a30"];

interface PrivateRowProps {
  proposalId: bigint;
  /** Reports the resolved status bucket up to the list, which filters on it. */
  onStatus?: (bucket: StatusBucket | undefined) => void;
  hidden?: boolean;
}

/** `proposalId` is the SPP (staged process) proposal id; the CRISP sub-proposal id is resolved on-chain. */
export function PrivateRow({ proposalId, onStatus, hidden }: PrivateRowProps) {
  const spp = useSppProposal("private", proposalId);
  const href = `#/proposals/private/${proposalId}`;

  if (spp.subProposalFailed) {
    return (
      <ProposalRow
        href={href}
        kindLabel="Private"
        loading
        loadingMessage="Sub-proposal creation failed"
        hidden={hidden}
      />
    );
  }
  if (spp.subProposalId === undefined) {
    return <ProposalRow href={href} kindLabel="Private" loading loadingMessage="Loading proposal…" hidden={hidden} />;
  }

  return (
    <PrivateRowBody
      href={href}
      subProposalId={spp.subProposalId}
      metadataUri={spp.metadataUri}
      creator={spp.creator}
      spp={spp}
      onStatus={onStatus}
      hidden={hidden}
    />
  );
}

function PrivateRowBody({
  href,
  subProposalId,
  metadataUri,
  creator,
  spp,
  onStatus,
  hidden,
}: {
  href: string;
  subProposalId: bigint;
  metadataUri?: string;
  creator?: string;
  spp: ReturnType<typeof useSppProposal>;
  onStatus?: (bucket: StatusBucket | undefined) => void;
  hidden?: boolean;
}) {
  const { proposal, totalVotingPower, e3Failed, status } = useProposal(subProposalId, { metadataUri, creator });
  const proposalStatus = useProposalStatus(proposal!, totalVotingPower, e3Failed);
  const sppOverride = getSppStatusOverride(spp.proposal, spp.state, spp.vetoTally, spp.vetoStage);

  const loading = !proposal || status.proposalLoading || (!proposal?.title && !status.metadataError);
  // A dead round would otherwise sit here as "Pending" — never active, never tallied — which
  // reads as "waiting to start" for something that can never run. The SPP override still wins:
  // a canceled or expired process is the more specific fact about the proposal.
  const resolvedLabel = loading
    ? undefined
    : (sppOverride?.label ?? (e3Failed ? "Round failed" : capitalize(proposalStatus)));
  const bucket = statusBucketOf(resolvedLabel);

  useEffect(() => {
    onStatus?.(bucket);
  }, [bucket, onStatus]);

  if (loading) {
    return <ProposalRow href={href} kindLabel="Private" loading loadingMessage="Loading proposal…" hidden={hidden} />;
  }

  const tally = Array.from(proposal.tally ?? []);
  const options = proposal.options ?? ["Yes", "No"];
  const totalVotes = tally.reduce((sum, count) => sum + (count ?? 0n), 0n);
  const isActive = !sppOverride && proposalStatus === ProposalStatus.ACTIVE;
  const endDate = Number(proposal.parameters.endDate) * 1000;
  const statusLabel = resolvedLabel ?? "";
  const statusClass = sppOverride?.className ?? (e3Failed ? "failed" : (proposalStatus ?? "").toString().toLowerCase());
  const rightLabel = rowTimingLabel({ isActive, endMs: endDate, statusLabel });

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
      hidden={hidden}
    />
  );
}
