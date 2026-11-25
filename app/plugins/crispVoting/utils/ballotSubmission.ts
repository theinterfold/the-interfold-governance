export type PreparedVoteReceipt = { voter: string; sender?: string; txHash: string | null };
export type BallotKind = "vote" | "mask";
export type BallotSubmissionResult = { success: true; txHash: string | null } | { success: false; error: string; uncertain?: boolean };

/**
 * The first submission of a vote and its mask, picked at random. If every voter sent the vote
 * first, the order alone would show which of the two inputs is the vote.
 */
export function randomFirstBallot(): BallotKind {
  return crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? "mask" : "vote";
}

/** Resolve the review once; confirmation sends that same order without drawing again. */
export function reviewFirstBallot({
  includeMask,
  anotherWallet,
  changeOrder,
}: {
  includeMask: boolean;
  anotherWallet: boolean;
  changeOrder: boolean;
}): BallotKind {
  if (!includeMask) return "vote";
  if (anotherWallet) return "mask";
  return changeOrder ? randomFirstBallot() : "vote";
}

/**
 * The vote and each mask are separate submissions. `first` places the mask list before or after
 * the vote. A failure or changed wallet/view stops all remaining submissions.
 */
export async function submitBallotSequence({
  vote,
  mask,
  masks,
  first = "vote",
  isCurrent,
  onStart,
  onResult,
}: {
  vote?: () => Promise<BallotSubmissionResult>;
  mask?: () => Promise<BallotSubmissionResult>;
  masks?: (() => Promise<BallotSubmissionResult>)[];
  /** Whether the vote or the mask list goes first. */
  first?: BallotKind;
  isCurrent: () => boolean;
  onStart: (kind: BallotKind, maskIndex?: number) => void;
  onResult: (kind: BallotKind, result: BallotSubmissionResult, maskIndex?: number) => void;
}) {
  const maskSteps = (masks ?? (mask ? [mask] : [])).map((submit, index) => ({ kind: "mask" as const, submit, index }));
  const voteSteps = vote ? [{ kind: "vote" as const, submit: vote, index: undefined }] : [];
  const sequence = first === "mask" ? [...maskSteps, ...voteSteps] : [...voteSteps, ...maskSteps];
  for (const { kind, submit, index } of sequence) {
    if (!isCurrent()) return;
    onStart(kind, index);
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
    onResult(kind, result, index);
    if (!result.success) return;
  }
}

/**
 * Masks sent on their own, one submission each, in list order. A failure or a changed wallet/view
 * stops the list, so the masks after a failed one stay unsent and can be sent again.
 */
export async function submitMaskSequence({
  masks,
  isCurrent,
  onStart,
  onResult,
}: {
  masks: (() => Promise<BallotSubmissionResult>)[];
  isCurrent: () => boolean;
  onStart: (index: number) => void;
  onResult: (index: number, result: BallotSubmissionResult) => void;
}) {
  for (const [index, submit] of masks.entries()) {
    if (!isCurrent()) return;
    onStart(index);
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
    onResult(index, result);
    if (!result.success) return;
  }
}
