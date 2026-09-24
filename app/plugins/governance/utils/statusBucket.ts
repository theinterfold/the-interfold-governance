/**
 * Collapses the status labels a proposal row can render into the coarse buckets
 * the list filters on.
 *
 * Rows label themselves from two sources: the SPP-level override
 * (`getSppStatusOverride` — Executed / Canceled / Vetoed / Executable / Expired /
 * Veto period / Foundation Approval) and, while stage 0 is undecided, the body-level `ProposalStatus`
 * (Pending / Active / Executed / Executable / Accepted / Rejected). Both funnel
 * through here so private and public rows bucket identically.
 *
 * `failed` is not a vote outcome: the private round broke (E3 died, or the sub-proposal was
 * never created), so the proposal was never decided. It is kept apart from `rejected` so the
 * default view can leave it out.
 */
export type StatusBucket = "pending" | "active" | "foundation" | "accepted" | "executed" | "rejected" | "failed";

export const STATUS_BUCKETS: { label: string; value: StatusBucket }[] = [
  { label: "Pending", value: "pending" },
  { label: "Active", value: "active" },
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
    // Stage 1 in flight, under either stage-1 mode: the foundation window.
    case "veto period":
    case "approval period":
    case "foundation approval":
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
    case "vetoed":
    case "expired":
    case "canceled":
    case "cancelled":
      return "rejected";
    default:
      return undefined;
  }
}
