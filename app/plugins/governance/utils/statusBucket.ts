/**
 * Collapses the status labels a proposal row can render into the coarse buckets
 * the list filters on.
 *
 * Rows label themselves from two sources: the SPP-level override
 * (`getSppStatusOverride` — Executed / Canceled / Vetoed / Executable / Expired /
 * Veto period / Approval period) and, while stage 0 is undecided, the body-level `ProposalStatus`
 * (Pending / Active / Executed / Executable / Accepted / Rejected). Both funnel
 * through here so private and public rows bucket identically.
 */
export type StatusBucket = "pending" | "active" | "accepted" | "executed" | "rejected";

export const STATUS_BUCKETS: { label: string; value: StatusBucket }[] = [
  { label: "Pending", value: "pending" },
  { label: "Active", value: "active" },
  { label: "Accepted", value: "accepted" },
  { label: "Executed", value: "executed" },
  { label: "Rejected", value: "rejected" },
];

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
    // Stage 1 in flight, under either stage-1 mode.
    case "veto period":
    case "approval period":
      return "active";
    // Passed the vote but not yet executed on the DAO.
    case "accepted":
    case "executable":
      return "accepted";
    case "executed":
      return "executed";
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
