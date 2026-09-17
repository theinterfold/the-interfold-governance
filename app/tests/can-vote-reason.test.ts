import { describe, expect, test } from "bun:test";

/**
 * `useCanVote` folds several very different situations into one verdict. These tests pin the
 * DECISION TABLE rather than the hook's React plumbing: the bug being guarded against is a timing
 * block ("voting opens in 25 minutes") being reported with the same words as an eligibility block
 * ("you hold no voting power"), which is what the old boolean did.
 *
 * The classifier below mirrors the hook's branch order exactly. If the hook's ordering changes,
 * these expectations should change with it.
 */

type Reason = "not-connected" | "not-started" | "ended" | "executed" | "no-voting-power" | "below-minimum";

interface Input {
  connected: boolean;
  executed: boolean;
  startDate: bigint;
  endDate: bigint;
  now: bigint;
  votes: bigint;
  minimum: bigint;
}

interface Verdict {
  canVote: boolean;
  reason: Reason | undefined;
  isTimingOnly: boolean;
}

function classify(i: Input): Verdict {
  if (!i.connected) return { canVote: false, reason: "not-connected", isTimingOnly: false };
  if (i.executed) return { canVote: false, reason: "executed", isTimingOnly: true };
  if (i.startDate > i.now) return { canVote: false, reason: "not-started", isTimingOnly: true };
  if (i.now >= i.endDate) return { canVote: false, reason: "ended", isTimingOnly: true };
  if (i.votes === 0n) return { canVote: false, reason: "no-voting-power", isTimingOnly: false };
  if (i.votes < i.minimum) return { canVote: false, reason: "below-minimum", isTimingOnly: false };
  return { canVote: true, reason: undefined, isTimingOnly: false };
}

// The live Sepolia proposal that exposed the bug: window 1789669264 -> 1789672864, observed at
// 1789667748 (1,516s early), voter holding 200e18 against a minimum of 1.
const LIVE = {
  connected: true,
  executed: false,
  startDate: 1_789_669_264n,
  endDate: 1_789_672_864n,
  votes: 200_000_000_000_000_000_000n,
  minimum: 1n,
};

describe("useCanVote reason classification", () => {
  test("an eligible voter before the window is blocked on TIMING, not eligibility", () => {
    const v = classify({ ...LIVE, now: 1_789_667_748n });
    expect(v.canVote).toBe(false);
    expect(v.reason).toBe("not-started");
    // The crux: this must NOT be reported as an eligibility failure. The voter is fully entitled
    // to vote and simply arrived early.
    expect(v.isTimingOnly).toBe(true);
  });

  test("the same voter inside the window can vote", () => {
    const v = classify({ ...LIVE, now: 1_789_670_000n });
    expect(v.canVote).toBe(true);
    expect(v.reason).toBeUndefined();
  });

  test("after the window closes the block is timing, not eligibility", () => {
    const v = classify({ ...LIVE, now: 1_789_672_864n });
    expect(v.reason).toBe("ended");
    expect(v.isTimingOnly).toBe(true);
  });

  test("endDate is exclusive: the final second is already closed", () => {
    expect(classify({ ...LIVE, now: 1_789_672_863n }).canVote).toBe(true);
    expect(classify({ ...LIVE, now: 1_789_672_864n }).reason).toBe("ended");
  });

  test("startDate is inclusive: voting opens exactly on the boundary", () => {
    expect(classify({ ...LIVE, now: 1_789_669_263n }).reason).toBe("not-started");
    expect(classify({ ...LIVE, now: 1_789_669_264n }).canVote).toBe(true);
  });

  test("zero snapshot power inside the window IS an eligibility failure", () => {
    const v = classify({ ...LIVE, now: 1_789_670_000n, votes: 0n });
    expect(v.reason).toBe("no-voting-power");
    // Not timing: waiting will never help, so it must be presented as an error.
    expect(v.isTimingOnly).toBe(false);
  });

  test("power below the minimum is distinguished from holding none", () => {
    const v = classify({ ...LIVE, now: 1_789_670_000n, votes: 5n, minimum: 10n });
    expect(v.reason).toBe("below-minimum");
    expect(v.isTimingOnly).toBe(false);
  });

  test("timing is evaluated BEFORE eligibility, so an early ineligible voter is told to wait", () => {
    // Both conditions fail. Reporting "no voting power" first would be actively misleading:
    // the snapshot has not been taken from their perspective yet.
    const v = classify({ ...LIVE, now: 1_789_667_748n, votes: 0n });
    expect(v.reason).toBe("not-started");
  });

  test("a disconnected wallet is never told it lacks voting power", () => {
    const v = classify({ ...LIVE, now: 1_789_670_000n, connected: false, votes: 0n });
    expect(v.reason).toBe("not-connected");
  });

  test("an executed proposal reports execution rather than an eligibility failure", () => {
    const v = classify({ ...LIVE, now: 1_789_670_000n, executed: true, votes: 0n });
    expect(v.reason).toBe("executed");
    expect(v.isTimingOnly).toBe(true);
  });

  test("exactly meeting the minimum is allowed", () => {
    expect(classify({ ...LIVE, now: 1_789_670_000n, votes: 10n, minimum: 10n }).canVote).toBe(true);
  });
});
