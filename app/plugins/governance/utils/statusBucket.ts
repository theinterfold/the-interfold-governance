import { capitalizeFirstLetter } from "@/utils/text";

import type { ProposalStatus } from "@aragon/ods";

/**
 * Collapses the status labels a proposal row can render into the coarse buckets
 * the list filters on.
 *
 * Rows label themselves from two sources: the SPP-level override
 * (`getSppStatusOverride` — Executed / Canceled / Vetoed / Executable / Expired /
 * Veto period / Foundation Approval) and the stage-0 presentation resolver
 * (Pending / Active / Awaiting tally / Confirming result / Vote passed / Rejected), which also yields
 * the body-level labels (Executed / Executable / Accepted / Quorum not met — see `bodyStatusLabel`).
 * Both funnel through here so private and public rows bucket identically.
 *
 * `failed` is not a vote outcome: the private round broke (E3 died, or the sub-proposal was
 * never created), so the proposal was never decided. It is kept apart from `rejected` so the
 * default view can leave it out.
 */
export type StatusBucket =
  | "pending"
  | "active"
  | "awaiting"
  | "confirming"
  | "votePassed"
  | "foundation"
  | "accepted"
  | "executed"
  | "rejected"
  | "failed";

export const STATUS_BUCKETS: { label: string; value: StatusBucket }[] = [
  { label: "Pending", value: "pending" },
  { label: "Active", value: "active" },
  { label: "Awaiting tally", value: "awaiting" },
  { label: "Confirming result", value: "confirming" },
  { label: "Vote passed", value: "votePassed" },
  { label: "Foundation Approval", value: "foundation" },
  { label: "Accepted", value: "accepted" },
  { label: "Executed", value: "executed" },
  { label: "Rejected", value: "rejected" },
  { label: "Failed", value: "failed" },
];

export type StatusFilter = "all" | StatusBucket;

/**
 * Whether a row with `bucket` shows under `filter`. "All" is every proposal that was actually
 * put to a vote — failed rounds are infrastructure noise and only show under "Failed". Rows
 * still resolving (`bucket` undefined) show under "All" so the list is not blank while loading.
 */
export function matchesStatusFilter(bucket: StatusBucket | undefined, filter: StatusFilter): boolean {
  return filter === "all" ? bucket !== "failed" : bucket === filter;
}

/**
 * The label a body-level `ProposalStatus` renders as, in the list rows and the detail headers alike.
 *
 * A quorum failure stays `REJECTED` — the chain refuses it exactly like a vote against, and every
 * status check keys on that — but "Rejected" reads as "voted down", and a quorum failure was not:
 * too few voted for the result to count. The label says which.
 *
 * @param status The status from the body's `useProposalStatus`.
 * @param quorumNotMet Whether that status is a rejection for lack of quorum.
 * @returns The label; empty while the status is unresolved.
 */
export function bodyStatusLabel(status: ProposalStatus | undefined, quorumNotMet: boolean): string {
  if (quorumNotMet) return "Quorum not met";
  return status ? capitalizeFirstLetter(status) : "";
}

/**
 * Maps a rendered status label to its bucket. Returns undefined for labels we
 * don't recognise, so a row is never silently filed under the wrong filter —
 * unknown rows simply only show under "All".
 */
export function statusBucketOf(label?: string): StatusBucket | undefined {
  switch (label?.trim().toLowerCase()) {
    case "pending":
      return "pending";
    case "active":
      return "active";
    case "awaiting tally":
      return "awaiting";
    case "confirming result":
      return "confirming";
    case "vote passed":
      return "votePassed";
    // Stage 1 in flight, under either stage-1 mode: the foundation window.
    case "veto period":
    case "approval period":
    case "foundation approval":
    case "awaiting foundation approval":
      return "foundation";
    // Passed the vote but not yet executed on the DAO.
    case "accepted":
    case "executable":
      return "accepted";
    case "executed":
      return "executed";
    // A dead E3 round was never decided, so it is not a rejection.
    case "round failed":
      return "failed";
    // Every terminal not-happening state reads as rejected to a filtering user.
    case "rejected":
    case "quorum not met":
    case "vetoed":
    case "expired":
    case "canceled":
    case "cancelled":
      return "rejected";
    default:
      return undefined;
  }
}
