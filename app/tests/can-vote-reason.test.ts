import { describe, expect, test } from "bun:test";
import { classifyVoteEligibility as classify } from "@/plugins/crispVoting/utils/voteEligibility";

import type { VoteEligibilityInput } from "@/plugins/crispVoting/utils/voteEligibility";

/**
 * `useCanVote` folds several very different situations into one verdict. These tests pin the
 * decision table in `classifyVoteEligibility`, which the hook calls once its reads land: the bug
 * being guarded against is a timing block ("voting opens in 25 minutes") being reported with the
 * same words as an eligibility block ("you hold no voting power"), which is what the old boolean did.
 */

// The live Sepolia proposal that exposed the bug: window 1789669264 -> 1789672864, observed at
// 1789667748 (1,516s early), voter holding 200e18 against a minimum of 1.
const LIVE: Omit<VoteEligibilityInput, "now"> = {
  executed: false,
  startDate: 1_789_669_264n,
  endDate: 1_789_672_864n,
  snapshot: 1_789_669_263n,
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

  test("an executed proposal reports execution rather than an eligibility failure", () => {
    const v = classify({ ...LIVE, now: 1_789_670_000n, executed: true, votes: 0n });
    expect(v.reason).toBe("executed");
    expect(v.isTimingOnly).toBe(true);
  });

  test("exactly meeting the minimum is allowed", () => {
    expect(classify({ ...LIVE, now: 1_789_670_000n, votes: 10n, minimum: 10n }).canVote).toBe(true);
  });
});
