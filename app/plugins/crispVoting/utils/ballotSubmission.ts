export type PreparedVoteReceipt = { voter: string; sender?: string; txHash: string | null };
export type BallotKind = "vote" | "mask";
export type BallotSubmissionResult = { success: true; txHash: string | null } | { success: false; error: string };

/** A mask is a separate submission. Never send it after a failed vote or a changed wallet/view. */
export async function submitBallotSequence({
  vote,
  mask,
  isCurrent,
  onStart,
  onResult,
}: {
  vote?: () => Promise<BallotSubmissionResult>;
  mask?: () => Promise<BallotSubmissionResult>;
  isCurrent: () => boolean;
  onStart: (kind: BallotKind) => void;
  onResult: (kind: BallotKind, result: BallotSubmissionResult) => void;
}) {
  for (const [kind, submit] of [
    ["vote", vote],
    ["mask", mask],
  ] as const) {
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
