import { useEffect } from "react";
import { ProposalStatus } from "@aragon/ods";
import { useProposal } from "@/plugins/tokenVoting/hooks/useProposal";
import { useProposalStatus } from "@/plugins/tokenVoting/hooks/useProposalVariantStatus";
import { unixTimestampToDate } from "@/plugins/crispVoting/utils/formatProposalDate";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { getSppStatusOverride } from "@/plugins/spp/utils/status";
import { statusBucketOf } from "../utils/statusBucket";
import { ProposalRow, capitalize } from "./proposalRow";

import type { StatusBucket } from "../utils/statusBucket";

const YES_COLOR = "#2f8a4f";
const NO_COLOR = "#a84932";
const ABSTAIN_COLOR = "#7a7d77";

interface PublicRowProps {
  proposalId: bigint;
  /** Reports the resolved status bucket up to the list, which filters on it. */
  onStatus?: (bucket: StatusBucket | undefined) => void;
  hidden?: boolean;
}

/** `proposalId` is the SPP (staged process) proposal id; the TokenVoting sub-proposal id is resolved on-chain. */
export function PublicRow({ proposalId, onStatus, hidden }: PublicRowProps) {
  const spp = useSppProposal("public", proposalId);
  const href = `#/proposals/public/${proposalId}`;

  if (spp.subProposalFailed) {
    return (
      <ProposalRow
        href={href}
        kindLabel="Public"
        loading
        loadingMessage="Sub-proposal creation failed"
        hidden={hidden}
      />
    );
  }
  if (spp.subProposalId === undefined) {
    return <ProposalRow href={href} kindLabel="Public" loading loadingMessage="Loading proposal…" hidden={hidden} />;
  }

  return (
    <PublicRowBody
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

function PublicRowBody({
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
  const { proposal, status } = useProposal(subProposalId, false, { metadataUri, creator });
  const proposalStatus = useProposalStatus(proposal!);
  const sppOverride = getSppStatusOverride(spp.proposal, spp.state, spp.vetoTally, spp.vetoStage);

  const loading = !proposal || status.proposalLoading || (!proposal?.title && !status.metadataError);
  const resolvedLabel = loading ? undefined : (sppOverride?.label ?? capitalize(proposalStatus));
  const bucket = statusBucketOf(resolvedLabel);

  useEffect(() => {
    onStatus?.(bucket);
  }, [bucket, onStatus]);

  if (loading) {
    return <ProposalRow href={href} kindLabel="Public" loading loadingMessage="Loading proposal…" hidden={hidden} />;
  }

  const { yes, no, abstain } = proposal.tally;
  const total = yes + no + abstain;
  const isActive = !sppOverride && proposalStatus === ProposalStatus.ACTIVE;
  const endDate = Number(proposal.parameters.endDate) * 1000;
  const statusLabel = resolvedLabel ?? "";
  const statusClass = sppOverride?.className ?? (proposalStatus ?? "").toString().toLowerCase();
  const rightLabel =
    isActive && endDate > Date.now() ? `Ends ${unixTimestampToDate(Math.round(endDate / 1000))}` : statusLabel;

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
      statusLabel={statusLabel}
      statusClass={statusClass}
      rightLabel={rightLabel}
      bars={bars}
      hidden={hidden}
    />
  );
}
