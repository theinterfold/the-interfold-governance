import { useEffect } from "react";
import { ProposalStatus } from "@aragon/ods";
import { useProposal } from "@/plugins/tokenVoting/hooks/useProposal";
import { useProposalStatus } from "@/plugins/tokenVoting/hooks/useProposalVariantStatus";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { getSppStatusOverride } from "@/plugins/spp/utils/status";
import { bodyStatusLabel, statusBucketOf } from "../utils/statusBucket";
import { ProposalRow, rowTimingLabel } from "./proposalRow";

import type { StatusBucket } from "../utils/statusBucket";
import ProposalDetail from "@/plugins/tokenVoting/pages/proposal";

const YES_COLOR = "#2f8a4f";
const NO_COLOR = "#a84932";
const ABSTAIN_COLOR = "#7a7d77";

interface PublicRowProps {
  proposalId: bigint;
  /** Reports the resolved status bucket up to the list, which filters on it. */
  onStatus?: (bucket: StatusBucket | undefined) => void;
  onSearchText?: (text: string) => void;
  hidden?: boolean;
}

/** `proposalId` is the SPP (staged process) proposal id; the TokenVoting sub-proposal id is resolved on-chain. */
export function PublicRow({ proposalId, onStatus, onSearchText, hidden }: PublicRowProps) {
  const spp = useSppProposal("public", proposalId);
  const href = `#/proposals/public/${proposalId}`;

  // A sub-proposal that was never created is a broken round, not a vote outcome: file it under
  // `failed` so "All" leaves it out, as the private row does.
  const subProposalFailed = spp.subProposalFailed;
  useEffect(() => {
    if (subProposalFailed) onStatus?.("failed");
  }, [subProposalFailed, onStatus]);

  if (spp.subProposalFailed) {
    return (
      <ProposalRow
        href={href}
        kindLabel="Transparent fallback"
        failedMessage="The voting round could not be created for this proposal, so no vote can be held on it. The staged process recorded the failure when the proposal was created and there is no retry — a new proposal is needed."
        hidden={hidden}
      />
    );
  }
  if (spp.subProposalId === undefined) {
    return (
      <ProposalRow
        href={href}
        kindLabel="Transparent fallback"
        loading
        loadingMessage="Loading proposal…"
        hidden={hidden}
      />
    );
  }

  return (
    <PublicRowBody
      href={href}
      proposalId={proposalId}
      subProposalId={spp.subProposalId}
      metadataUri={spp.metadataUri}
      creator={spp.creator}
      spp={spp}
      onStatus={onStatus}
      onSearchText={onSearchText}
      hidden={hidden}
    />
  );
}

function PublicRowBody({
  href,
  proposalId,
  subProposalId,
  metadataUri,
  creator,
  spp,
  onStatus,
  onSearchText,
  hidden,
}: {
  href: string;
  proposalId: bigint;
  subProposalId: bigint;
  metadataUri?: string;
  creator?: string;
  spp: ReturnType<typeof useSppProposal>;
  onStatus?: (bucket: StatusBucket | undefined) => void;
  onSearchText?: (text: string) => void;
  hidden?: boolean;
}) {
  const { proposal, status } = useProposal(subProposalId, false, { metadataUri, creator });
  const { status: proposalStatus, quorumNotMet } = useProposalStatus(proposal!);
  const sppOverride = getSppStatusOverride(spp.proposal, spp.state, spp.vetoTally, spp.vetoStage);

  // Only a proposal with no data yet is loading. A background refetch keeps the row as it is: the
  // loading row unmounts the open details, and the details read this proposal again when they
  // mount, which starts the next refetch.
  const loading = !proposal || (!proposal.title && !status.metadataError);
  const resolvedLabel = loading ? undefined : (sppOverride?.label ?? bodyStatusLabel(proposalStatus, quorumNotMet));
  const bucket = statusBucketOf(resolvedLabel);

  useEffect(() => {
    onStatus?.(bucket);
  }, [bucket, onStatus]);

  const searchText = proposal
    ? `${proposal.title ?? ""} ${proposal.summary ?? ""} ${proposal.creator ?? ""}`
    : undefined;
  useEffect(() => {
    if (searchText !== undefined) onSearchText?.(searchText);
  }, [searchText, onSearchText]);

  if (loading) {
    return (
      <ProposalRow
        href={href}
        kindLabel="Transparent fallback"
        loading
        loadingMessage="Loading proposal…"
        hidden={hidden}
      />
    );
  }

  const { yes, no, abstain } = proposal.tally;
  const total = yes + no + abstain;
  const isActive = !sppOverride && proposalStatus === ProposalStatus.ACTIVE;
  const endDate = Number(proposal.parameters.endDate) * 1000;
  const statusLabel = resolvedLabel ?? "";
  const statusClass = sppOverride?.className ?? (proposalStatus ?? "").toString().toLowerCase();
  const rightLabel = rowTimingLabel({ isActive, endMs: endDate, statusLabel });

  const bars =
    total > 0n
      ? [
          { width: Number((yes * 10000n) / total) / 100, color: YES_COLOR, label: "Yes" },
          { width: Number((no * 10000n) / total) / 100, color: NO_COLOR, label: "No" },
          { width: Number((abstain * 10000n) / total) / 100, color: ABSTAIN_COLOR, label: "Abstain" },
        ]
      : [];

  return (
    <ProposalRow
      href={href}
      kindLabel="Transparent fallback"
      title={proposal.title}
      summary={proposal.summary}
      creator={proposal.creator}
      statusLabel={statusLabel}
      statusClass={statusClass}
      votingOpen={isActive && endDate > Date.now() && Number(proposal.parameters.startDate) * 1000 <= Date.now()}
      rightLabel={rightLabel}
      votingEndMs={endDate}
      bars={bars}
      resultLabel={isActive ? "Live vote share" : endDate <= Date.now() ? "Final vote share" : "Voting results"}
      resultMessage={total === 0n ? "No votes recorded." : undefined}
      details={<ProposalDetail index={proposalId} embedded={true} />}
      hidden={hidden}
    />
  );
}
