import { unixTimestampToDate } from "./formatProposalDate";

/**
 * Why a connected wallet cannot cast a ballot right now.
 *
 * `not-started` and `ended` are timing, not eligibility: the voter may be perfectly entitled to
 * vote and simply be early or late. Folding them into the same boolean as `no-voting-power`
 * produced the misleading "You cannot vote on this proposal" on a proposal whose window had not
 * opened yet.
 */
export type VoteBlockedReason =
  | "not-connected"
  | "not-started"
  | "ended"
  | "executed"
  | "no-voting-power"
  | "below-minimum";

export interface CanVoteResult {
  /** `undefined` while the on-chain reads are still in flight. */
  canVote: boolean | undefined;
  reason: VoteBlockedReason | undefined;
  /** Specific, human-readable explanation. `undefined` when the voter can vote. */
  message: string | undefined;
  /** True when the block is purely about timing, so callers can pick a softer presentation. */
  isTimingOnly: boolean;
}

export interface VoteEligibilityInput {
  executed: boolean;
  startDate: bigint;
  endDate: bigint;
  /** The snapshot timepoint, only used to word the no-power message. */
  snapshot: bigint;
  now: bigint;
  /** Voting power at the snapshot. */
  votes: bigint;
  minimum: bigint;
}

const blocked = (reason: VoteBlockedReason, message: string, isTimingOnly: boolean): CanVoteResult => ({
  canVote: false,
  reason,
  message,
  isTimingOnly,
});

/**
 * The CRISP vote verdict for a connected wallet whose reads have all landed.
 *
 * Branch order is the contract: timing is reported before eligibility (an early voter is told to
 * wait, not that they hold nothing).
 *
 * @param i The proposal window and the voter's snapshot power.
 * @returns Whether the wallet can vote, and why not when it cannot.
 */
export function classifyVoteEligibility(i: VoteEligibilityInput): CanVoteResult {
  if (i.executed) {
    return blocked("executed", "This proposal has already been executed.", true);
  }
  if (i.startDate > i.now) {
    return blocked("not-started", `Voting has not opened yet. It starts on ${unixTimestampToDate(i.startDate)}.`, true);
  }
  if (i.now >= i.endDate) {
    return blocked("ended", `Voting closed on ${unixTimestampToDate(i.endDate)}.`, true);
  }
  // Eligibility is measured at the snapshot, not now, so a wallet funded or self-delegated after
  // the proposal was created still reads zero here. Say so explicitly — it is the single most
  // common cause of an unexpected block, and "you have no voting power" alone sends people to
  // check their current balance, which looks fine.
  if (i.votes === 0n) {
    return blocked(
      "no-voting-power",
      `You had no voting power at the snapshot (${unixTimestampToDate(i.snapshot)}). ` +
        `Tokens acquired or self-delegated after that moment do not count for this proposal.`,
      false
    );
  }
  if (i.votes < i.minimum) {
    return blocked(
      "below-minimum",
      "Your voting power at the snapshot was below the minimum required to vote on this proposal.",
      false
    );
  }

  return { canVote: true, reason: undefined, message: undefined, isTimingOnly: false };
}
