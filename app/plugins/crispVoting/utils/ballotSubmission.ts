export type PreparedVoteReceipt = { voter: string; sender?: string; txHash: string | null };
export type BallotKind = "vote" | "mask";
export type BallotSubmissionResult = { success: true; txHash: string | null } | { success: false; error: string };

/**
 * The first submission of a vote and its mask, picked at random. If every voter sent the vote
 * first, the order alone would show which of the two inputs is the vote.
 */
export function randomFirstBallot(): BallotKind {
  return crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? "mask" : "vote";
}

/**
 * The vote and the mask are separate submissions, sent in the order that `first` sets. A failure or
 * a changed wallet/view stops the sequence, so the second submission is never sent without the first.
 */
export async function submitBallotSequence({
  vote,
  mask,
  first = "vote",
  isCurrent,
  onStart,
  onResult,
}: {
  vote?: () => Promise<BallotSubmissionResult>;
  mask?: () => Promise<BallotSubmissionResult>;
  /** The submission that goes first when there are two. */
  first?: BallotKind;
  isCurrent: () => boolean;
  onStart: (kind: BallotKind) => void;
  onResult: (kind: BallotKind, result: BallotSubmissionResult) => void;
}) {
  const submissions = { vote, mask };
  const order = first === "mask" ? (["mask", "vote"] as const) : (["vote", "mask"] as const);
  for (const kind of order) {
    const submit = submissions[kind];
    if (!submit) continue;
    if (!isCurrent()) return;
    onStart(kind);
    let result: BallotSubmissionResult;
    try {
      result = await submit();
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : "Submission failed. Please try again.",
      };
    }
    if (!isCurrent()) return;
    onResult(kind, result);
    if (!result.success) return;
  }
}
