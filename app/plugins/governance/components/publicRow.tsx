import { useEffect } from "react";
import { useProposal } from "@/plugins/tokenVoting/hooks/useProposal";
import { useProposalStatus } from "@/plugins/tokenVoting/hooks/useProposalVariantStatus";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { getSppStatusOverride } from "@/plugins/spp/utils/status";
import { ProposalStatus } from "@aragon/ods";
import { bodyStatusLabel, statusBucketOf } from "../utils/statusBucket";
import { ProposalRow } from "./proposalRow";
import { ballotOptionColor } from "@/components/proposalVoting/ballot";
import { proposalPresentation } from "../utils/proposalPresentation";
import { useProposalBoundaryClock } from "../utils/useProposalBoundaryClock";

import type { StatusBucket } from "../utils/statusBucket";
import ProposalDetail from "@/plugins/tokenVoting/pages/proposal";

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
    else if (spp.missing || spp.error) onStatus?.(undefined);
  }, [subProposalFailed, spp.missing, spp.error, onStatus]);
  useEffect(() => {
    if (spp.subProposalId === undefined) onSearchText?.(proposalId.toString());
  }, [spp.subProposalId, proposalId, onSearchText]);

  if (spp.subProposalFailed) {
    return (
      <ProposalRow
        href={href}
        kindLabel="Transparent fallback"
        title={`Proposal #${proposalId}`}
        statusLabel="Creation failed"
        failureMessage="The voting round could not be created, so no vote can be held. The staged process records this failure once and offers no retry. Create a new proposal."
        hidden={hidden}
      />
    );
  }
  if (spp.missing || spp.error) {
    return (
      <ProposalRow
        href={href}
        kindLabel="Transparent fallback"
        title={`Proposal #${proposalId}`}
        statusLabel={spp.missing ? "Not found" : "Unavailable"}
        failureMessage={
          spp.missing ? "This proposal could not be found on-chain." : "Proposal details could not be loaded."
        }
        onRetry={spp.missing ? undefined : () => void spp.retry()}
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
  const sppOverride = getSppStatusOverride(spp.proposal, spp.state, spp.vetoTally, spp.vetoStage);

  // Only a proposal with no data yet is loading. A background refetch keeps the row as it is: the
  // loading row unmounts the open details, and the details read this proposal again when they
  // mount, which starts the next refetch.
  const loading = !proposal || (!proposal.title && !status.metadataError);
  const nowMs = useProposalBoundaryClock(
    proposal ? Number(proposal.parameters.startDate) * 1000 : undefined,
    proposal ? Number(proposal.parameters.endDate) * 1000 : undefined
  );
  const { status: proposalStatus, quorumNotMet } = useProposalStatus(proposal!, nowMs, status.proposalReadAtMs);
  const resolved =
    proposal || sppOverride
      ? proposalPresentation({
          sppOverride,
          bodyStatus: proposalStatus,
          startMs: Number(proposal?.parameters.startDate ?? 0n) * 1000,
          endMs: Number(proposal?.parameters.endDate ?? 0n) * 1000,
          nowMs,
        })
      : undefined;
  // A quorum failure stays a rejection for the status checks, but the label says why.
  const presentation =
    resolved && quorumNotMet && resolved.label === "Rejected"
      ? { ...resolved, label: bodyStatusLabel(ProposalStatus.REJECTED, true) }
      : resolved;
  const bucket = statusBucketOf(presentation?.label);

  useEffect(() => {
    onStatus?.(bucket);
  }, [bucket, onStatus]);

  const searchText = proposal
    ? `${proposal.title ?? ""} ${proposal.summary ?? ""} ${proposal.creator ?? ""}`
    : undefined;
  useEffect(() => {
    if (searchText !== undefined) onSearchText?.(searchText);
  }, [searchText, onSearchText]);

  if (loading && sppOverride && presentation) {
    return (
      <ProposalRow
        href={href}
        kindLabel="Transparent fallback"
        title={proposal?.title}
        summary={proposal?.summary}
        creator={proposal?.creator ?? creator}
        statusLabel={presentation.label}
        statusClass={presentation.className}
        rightLabel={presentation.timing}
        details={<ProposalDetail index={proposalId} embedded={true} />}
        hidden={hidden}
      />
    );
  }

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
  const startDate = Number(proposal.parameters.startDate) * 1000;
  const endDate = Number(proposal.parameters.endDate) * 1000;
  const view = presentation!;

  const bars =
    total > 0n
      ? [
          { width: Number((yes * 10000n) / total) / 100, color: ballotOptionColor(0), label: "Yes" },
          { width: Number((no * 10000n) / total) / 100, color: ballotOptionColor(1), label: "No" },
          { width: Number((abstain * 10000n) / total) / 100, color: ballotOptionColor(2), label: "Abstain" },
        ]
      : [];

  return (
    <ProposalRow
      href={href}
      kindLabel="Transparent fallback"
      title={proposal.title}
      summary={proposal.summary}
      creator={proposal.creator}
      statusLabel={view.label}
      statusClass={view.className}
      votingOpen={view.votingOpen}
      rightLabel={view.timing}
      votingEndMs={endDate}
      votingPending={view.votingPending}
      votingStartMs={startDate}
      bars={bars}
      resultLabel={view.votingOpen ? "Live vote share" : endDate <= Date.now() ? "Final vote share" : "Voting results"}
      resultMessage={total === 0n ? "No votes recorded." : undefined}
      details={<ProposalDetail index={proposalId} embedded={true} />}
      hidden={hidden}
    />
  );
}
