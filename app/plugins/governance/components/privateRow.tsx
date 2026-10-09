import { useEffect } from "react";
import { useProposal } from "@/plugins/crispVoting/hooks/useProposal";
import { useProposalStatus } from "@/plugins/crispVoting/hooks/useProposalStatus";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { getSppStatusOverride } from "@/plugins/spp/utils/status";
import { ProposalStatus } from "@aragon/ods";
import { bodyStatusLabel, statusBucketOf } from "../utils/statusBucket";
import { ProposalRow } from "./proposalRow";
import { ballotOptionColor } from "@/components/proposalVoting/ballot";
import { proposalPresentation } from "../utils/proposalPresentation";
import { useProposalBoundaryClock } from "../utils/useProposalBoundaryClock";

import type { StatusBucket } from "../utils/statusBucket";
import ProposalDetail from "@/plugins/crispVoting/pages/proposal";

interface PrivateRowProps {
  proposalId: bigint;
  /** Reports the resolved status bucket up to the list, which filters on it. */
  onStatus?: (bucket: StatusBucket | undefined) => void;
  onSearchText?: (text: string) => void;
  hidden?: boolean;
}

/** `proposalId` is the SPP (staged process) proposal id; the CRISP sub-proposal id is resolved on-chain. */
export function PrivateRow({ proposalId, onStatus, onSearchText, hidden }: PrivateRowProps) {
  const spp = useSppProposal("private", proposalId);
  const href = `#/proposals/private/${proposalId}`;

  // A sub-proposal that was never created is a broken round, not a vote outcome, so it reports
  // `failed`. Without this the row reports no bucket at all and escapes every filter — a dead
  // proposal would show up even under "Active".
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
        kindLabel="Secret ballot"
        title={`Proposal #${proposalId}`}
        statusLabel="Creation failed"
        failureMessage="The encrypted voting round could not be created, so no vote can be held. The staged process records this failure once and offers no retry. Create a new proposal."
        hidden={hidden}
      />
    );
  }
  if (spp.missing || spp.error) {
    return (
      <ProposalRow
        href={href}
        kindLabel="Secret ballot"
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
      <ProposalRow href={href} kindLabel="Secret ballot" loading loadingMessage="Loading proposal…" hidden={hidden} />
    );
  }

  return (
    <PrivateRowBody
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

function PrivateRowBody({
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
  const { proposal, totalVotingPower, e3Failed, networkProgress, status } = useProposal(subProposalId, {
    metadataUri,
    creator,
  });
  const sppOverride = getSppStatusOverride(spp.proposal, spp.state, spp.vetoTally, spp.vetoStage);

  // Only a proposal with no data yet is loading. A background refetch keeps the row as it is: the
  // loading row unmounts the open details, and the details read this proposal again when they
  // mount, which starts the next refetch.
  const loading = !proposal || (!proposal.title && !status.metadataError);
  const nowMs = useProposalBoundaryClock(
    proposal ? Number(proposal.parameters.startDate) * 1000 : undefined,
    proposal ? Number(proposal.parameters.endDate) * 1000 : undefined
  );
  const { status: proposalStatus, quorumNotMet } = useProposalStatus(proposal!, totalVotingPower, e3Failed, nowMs);
  // A dead round would otherwise sit here as "Pending" — never active, never tallied — which
  // reads as "waiting to start" for something that can never run. The SPP override still wins:
  // a canceled or expired process is the more specific fact about the proposal.
  const resolved =
    proposal || sppOverride
      ? proposalPresentation({
          sppOverride,
          bodyStatus: proposalStatus,
          startMs: Number(proposal?.parameters.startDate ?? 0n) * 1000,
          endMs: Number(proposal?.parameters.endDate ?? 0n) * 1000,
          isTallied: proposal?.isTallied ?? false,
          networkResultPublished: networkProgress.published,
          roundFailed: e3Failed,
          nowMs,
        })
      : undefined;
  // A quorum failure stays a rejection for the status checks, but the label says why.
  const presentation =
    resolved && quorumNotMet && resolved.label === "Rejected"
      ? { ...resolved, label: bodyStatusLabel(ProposalStatus.REJECTED, true) }
      : resolved;
  // Bucket on `e3Failed` itself, not the label: once stage 0 lapses the SPP override relabels a
  // dead round "Expired", which would otherwise file it with genuine rejections.
  const bucket: StatusBucket | undefined = e3Failed ? "failed" : statusBucketOf(presentation?.label);

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
        kindLabel="Secret ballot"
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
      <ProposalRow href={href} kindLabel="Secret ballot" loading loadingMessage="Loading proposal…" hidden={hidden} />
    );
  }

  const tally = Array.from(proposal.tally ?? []);
  const options = proposal.options ?? ["Yes", "No"];
  const totalVotes = tally.reduce((sum, count) => sum + (count ?? 0n), 0n);
  const startDate = Number(proposal.parameters.startDate) * 1000;
  const endDate = Number(proposal.parameters.endDate) * 1000;
  const view = presentation!;

  const bars =
    view.showTally && totalVotes > 0n
      ? options.map((label, i) => ({
          width: Number(((tally[i] ?? 0n) * 10000n) / totalVotes) / 100,
          color: ballotOptionColor(i),
          label,
        }))
      : [];

  return (
    <ProposalRow
      href={href}
      kindLabel="Secret ballot"
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
      resultLabel={view.showTally ? "Final vote share" : "Secret ballot"}
      resultMessage={
        (view.label === "Awaiting tally" && networkProgress.phase !== "Status unavailable"
          ? `Voting closed. ${networkProgress.phase}: ${networkProgress.description}`
          : view.resultMessage) ??
        (!view.showTally
          ? "Results stay private until the tally is published."
          : totalVotes === 0n
            ? "No votes recorded."
            : undefined)
      }
      details={<ProposalDetail index={proposalId} embedded={true} />}
      hidden={hidden}
    />
  );
}
