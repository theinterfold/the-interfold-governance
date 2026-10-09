import { ProposalStatus } from "@aragon/ods";

type SppOverride = { label: string; className: string } | undefined;

export type ProposalPresentation = {
  label: string;
  className: string;
  timing: string;
  resultMessage?: string;
  votingOpen: boolean;
  /** Voting has not started yet. Readers then want the start time. */
  votingPending: boolean;
  showTally: boolean;
};

/** Resolve the status readers see from the staged proposal and its voting body. */
export function proposalPresentation({
  sppOverride,
  bodyStatus,
  startMs,
  endMs,
  isTallied = true,
  networkResultPublished = false,
  roundFailed = false,
  nowMs = Date.now(),
}: {
  sppOverride?: SppOverride;
  bodyStatus?: ProposalStatus;
  startMs: number;
  endMs: number;
  isTallied?: boolean;
  networkResultPublished?: boolean;
  roundFailed?: boolean;
  nowMs?: number;
}): ProposalPresentation {
  const result = (
    label: string,
    className: string,
    timing = label,
    resultMessage?: string,
    showTally = isTallied
  ): ProposalPresentation => ({
    label,
    className,
    timing,
    resultMessage,
    votingOpen: false,
    votingPending: false,
    showTally,
  });

  // The SPP alone establishes DAO execution and the foundation-stage outcome.
  if (sppOverride) {
    const label = sppOverride.label === "Foundation Approval" ? "Awaiting Foundation approval" : sppOverride.label;
    return result(label, sppOverride.className, label, undefined, isTallied);
  }
  if (roundFailed)
    return result("Round failed", "failed", "Round failed", "This voting round could not complete.", false);
  if (nowMs < startMs) {
    return { ...result("Pending", "pending", "Voting has not started", undefined, false), votingPending: true };
  }
  // A body executed early has definitively completed stage 0.
  if (bodyStatus === ProposalStatus.EXECUTED) return result("Vote passed", "accepted", "Awaiting Foundation stage");
  if (nowMs < endMs) {
    return {
      label: "Active",
      className: "active",
      timing: "Voting is open",
      votingOpen: true,
      votingPending: false,
      showTally: isTallied,
    };
  }
  if (!isTallied && networkResultPublished) {
    return result(
      "Confirming result",
      "pending",
      "Voting ended",
      "The result is published. Loading voting totals.",
      false
    );
  }
  if (!isTallied) {
    return result(
      "Awaiting tally",
      "pending",
      "Voting ended",
      "Voting closed. The result has not been published.",
      false
    );
  }
  if (bodyStatus === ProposalStatus.REJECTED) return result("Rejected", "failed", "Vote did not pass");
  if (bodyStatus === ProposalStatus.ACCEPTED || bodyStatus === ProposalStatus.EXECUTABLE) {
    return result("Vote passed", "accepted", "Awaiting Foundation stage");
  }
  // A published tally may still lack token supply or quorum data. Do not infer a pass.
  return result("Confirming result", "pending", "Voting ended");
}
