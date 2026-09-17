import { describe, expect, test } from "bun:test";
import { isVotingOpenAt, scheduleVotingStart } from "@/plugins/crispVoting/utils/votingSchedule";

describe("CRISP voting schedule", () => {
  test("adds a transaction buffer after the protocol's earliest start", () => {
    expect(scheduleVotingStart(1_000n, 30)).toBe(1_030n);
  });

  test("normalizes fractional and negative configuration values", () => {
    expect(scheduleVotingStart(1_000n, 30.9)).toBe(1_030n);
    expect(scheduleVotingStart(1_000n, -30)).toBe(1_000n);
    expect(scheduleVotingStart(1_000n, Number.NaN)).toBe(1_000n);
  });

  test("opens at the scheduled start and closes at the commitment deadline", () => {
    expect(isVotingOpenAt(999n, 1_000n, 2_000n)).toBe(false);
    expect(isVotingOpenAt(1_000n, 1_000n, 2_000n)).toBe(true);
    expect(isVotingOpenAt(1_999n, 1_000n, 2_000n)).toBe(true);
    expect(isVotingOpenAt(2_000n, 1_000n, 2_000n)).toBe(false);
  });
});
