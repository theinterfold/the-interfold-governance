import { describe, expect, test } from "bun:test";
import {
  ballotWeightPercentage,
  chooseBallotWeight,
  draftBallotWeight,
  isUnchangedBallot,
  reviewedVote,
  rerandomizeBallotWeight,
  type BallotWeight,
} from "../plugins/crispVoting/utils/ballotWeight";

const voter = "0x1111111111111111111111111111111111111111";
const weight: BallotWeight = {
  roundId: 42n,
  voter,
  available: 1000n,
  power: 1000n * 10n ** 12n,
  counted: 995n,
  randomize: true,
  unit: 10n ** 12n,
  decimals: 18,
};

describe("Private ballot weight", () => {
  test("random weights stay within 99% and strictly below full power, including fractional lower bounds", () => {
    for (const available of [100n, 101n, 199n, 200n, 1000n, 2n ** 33n - 1n]) {
      for (let i = 0; i < 100; i++) {
        const counted = chooseBallotWeight(available, true);
        expect(counted * 100n >= available * 99n).toBe(true);
        expect(counted < available).toBe(true);
      }
    }
  });
  test("reaches both ends of the band", () => {
    // The band of 200 is {198, 199}. 400 draws miss one end with probability 2^-399.
    expect(new Set(Array.from({ length: 400 }, () => chooseBallotWeight(200n, true)))).toEqual(new Set([198n, 199n]));
  });
  test("disabling randomization uses the exact full balance", () => {
    for (const balance of [1n, 99n, 101n, 12345678901234567890n]) {
      expect(chooseBallotWeight(balance, false)).toBe(balance);
    }
  });
  test("small balances never become zero or drop more than 1%", () => {
    for (let available = 1n; available < 100n; available++) expect(chooseBallotWeight(available, true)).toBe(available);
    expect(() => chooseBallotWeight(0n, true)).toThrow();
    expect(() => chooseBallotWeight(-1n, false)).toThrow();
  });
  test("custom percentages count the selected share and round down to whole ballot units", () => {
    for (let percentage = 1; percentage <= 100; percentage++) {
      expect(chooseBallotWeight(1000n, false, percentage)).toBe(BigInt(percentage) * 10n);
    }
    expect(chooseBallotWeight(199n, false, 50)).toBe(99n);
    expect(chooseBallotWeight(12345678901234567890n, false, 25)).toBe(3086419725308641972n);
    expect(chooseBallotWeight(6570000n, false, 25)).toBe(1642500n);
  });
  test("custom percentages reject invalid inputs, randomization and amounts below one ballot unit", () => {
    for (const percentage of [0, -1, 101, 1.5, NaN, Infinity]) {
      expect(() => chooseBallotWeight(1000n, false, percentage)).toThrow();
    }
    expect(() => chooseBallotWeight(1000n, true, 25)).toThrow();
    expect(() => chooseBallotWeight(1n, false, 1)).toThrow("minimum voting weight");
    expect(chooseBallotWeight(1n, false, 100)).toBe(1n);
  });
  test("custom reviews preserve the exact amount and reject altered or stale reviews", () => {
    for (const percentage of [1, 25, 100]) {
      const custom = { ...weight, randomize: false, percentage, counted: BigInt(percentage) * 10n };
      for (let option = 0; option < 3; option++) {
        expect(reviewedVote(custom, 1000n, 42n, voter, option, 3)).toEqual(
          Array.from({ length: 3 }, (_, i) => i === option ? percentage * 10 : 0)
        );
      }
      expect(() => reviewedVote({ ...custom, counted: custom.counted + 1n }, 1000n, 42n, voter, 0, 3)).toThrow();
      expect(() => reviewedVote({ ...custom, randomize: true }, 1000n, 42n, voter, 0, 3)).toThrow();
      expect(() => reviewedVote(custom, 1001n, 42n, voter, 0, 3)).toThrow();
      expect(() => reviewedVote(custom, 1000n, 43n, voter, 0, 3)).toThrow();
      expect(() => reviewedVote(custom, 1000n, 42n, "0x2222222222222222222222222222222222222222", 0, 3)).toThrow();
    }
  });
  test("encrypts the reviewed amount for Yes, No and Abstain and preserves the full eligibility balance", () => {
    for (let option = 0; option < 3; option++) {
      const vote = reviewedVote(weight, 1000n, 42n, voter, option, 3);
      expect(vote[option]).toBe(995);
      expect(vote.reduce((a, b) => a + b, 0)).toBe(995);
      expect(reviewedVote(weight, 1000n, 42n, voter, option, 3)).toEqual(vote);
      expect(weight.available).toBe(1000n);
    }
  });
  test("a stale balance, different wallet or different proposal cannot reuse the review", () => {
    expect(() => reviewedVote(weight, 1001n, 42n, voter, 0, 3)).toThrow("Review the ballot again");
    expect(() => reviewedVote(weight, 1000n, 43n, voter, 0, 3)).toThrow();
    expect(() => reviewedVote(weight, 1000n, 42n, "0x2222222222222222222222222222222222222222", 0, 3)).toThrow();
    expect(() => reviewedVote(undefined, 1000n, 42n, voter, 0, 3)).toThrow();
  });
  test("rejects zero, excessive, out-of-range and unreviewed full weights", () => {
    for (const counted of [0n, 989n, 1000n, 1001n]) {
      expect(() => reviewedVote({ ...weight, counted }, 1000n, 42n, voter, 0, 3)).toThrow();
    }
    expect(() => reviewedVote({ ...weight, randomize: false }, 1000n, 42n, voter, 0, 3)).toThrow();
    expect(reviewedVote({ ...weight, counted: 1000n, randomize: false }, 1000n, 42n, voter, 0, 3)).toEqual([
      1000, 0, 0,
    ]);
    expect(reviewedVote({ ...weight, available: 1n, counted: 1n }, 1n, 42n, voter, 0, 3)).toEqual([1, 0, 0]);
    for (const option of [-1, 3, 0.5, NaN]) expect(() => reviewedVote(weight, 1000n, 42n, voter, option, 3)).toThrow();
  });
  test("percentages compare the counted tokens with the full voting power and never round a loss to 100%", () => {
    expect(ballotWeightPercentage(weight)).toBe("99.50%");
    // Sepolia round 1: one unit is 11,000,300 FOLD / t = 100, plus 1 wei. 111,100 FOLD holds one
    // unit, and the remainder of about 1,097 FOLD does not count.
    const unit = 110_003n * 10n ** 18n + 1n;
    expect(ballotWeightPercentage({ counted: 1n, unit, power: 111_100n * 10n ** 18n })).toBe(
      "99.01%"
    );
    expect(ballotWeightPercentage({ counted: 999_999n, unit: 1n, power: 1_000_000n })).toBe("99.99%");
    expect(ballotWeightPercentage({ counted: 1n, unit: 1n, power: 1n })).toBe("100.00%");
  });
});


describe("Explicit Randomize action", () => {
  test("each click changes the displayed percentage and retains a valid reviewed weight", () => {
    let previous = { ...weight, available: 5_000_000n, power: 5_000_000n, unit: 1n, counted: 4_995_000n };
    for (let click = 0; click < 100; click++) {
      const next = rerandomizeBallotWeight(previous);
      expect(next.counted).not.toBe(previous.counted);
      expect(ballotWeightPercentage(next)).not.toBe(ballotWeightPercentage(previous));
      expect(next.counted).toBeGreaterThanOrEqual(4_950_000n);
      expect(next.counted).toBeLessThan(5_000_000n);
      expect(reviewedVote(next, next.available, next.roundId, next.voter, 0, 3)[0]).toBe(Number(next.counted));
      previous = next;
    }
  });
  test("coarse rounds retain their only possible weight and never produce zero", () => {
    for (const available of [1n, 99n, 100n, 199n]) {
      const next = rerandomizeBallotWeight({ ...weight, available, power: available, unit: 1n, counted: available });
      expect(next.counted).toBe(available < 100n ? available : available - 1n);
    }
  });
  test("returning from a custom value clears its percentage", () => {
    const next = rerandomizeBallotWeight({ ...weight, counted: 250n, randomize: false, percentage: 25 });
    expect(next.randomize).toBe(true);
    expect(next.percentage).toBeUndefined();
    expect(reviewedVote(next, weight.available, weight.roundId, voter, 0, 3)[0]).toBe(Number(next.counted));
  });
});


describe("Changing a submitted ballot", () => {
  const submitted = { option: 0, weight: draftBallotWeight(weight, false, 25)! };

  test("Yes at 25% can become Yes at 50%, but returning to 25% is unchanged", () => {
    expect(isUnchangedBallot(submitted, 0, draftBallotWeight(weight, false, 25))).toBe(true);
    expect(isUnchangedBallot(submitted, 0, draftBallotWeight(weight, false, 50))).toBe(false);
    expect(isUnchangedBallot(submitted, 0, draftBallotWeight(weight, false, 25))).toBe(true);
    expect(isUnchangedBallot(submitted, 1, draftBallotWeight(weight, false, 25))).toBe(false);
    expect(submitted.weight.counted).toBe(250n);
  });

  test("full power and a new random amount are changes, while mode alone is not", () => {
    const random = { option: 0, weight };
    expect(isUnchangedBallot(random, 0, draftBallotWeight(weight, true))).toBe(true);
    expect(isUnchangedBallot(random, 0, draftBallotWeight(weight, false))).toBe(false);
    expect(isUnchangedBallot(random, 0, rerandomizeBallotWeight(weight))).toBe(false);
    const full = { option: 0, weight: draftBallotWeight(weight, false)! };
    expect(isUnchangedBallot(full, 0, draftBallotWeight(weight, false, 100))).toBe(true);
  });

  test("coarse rounding compares the ballot amount and invalid percentages remain invalid", () => {
    const coarse = { ...weight, available: 10n, counted: 10n, power: 10n, unit: 1n };
    const previous = { option: 0, weight: draftBallotWeight(coarse, false, 25)! };
    expect(isUnchangedBallot(previous, 0, draftBallotWeight(coarse, false, 29))).toBe(true);
    expect(isUnchangedBallot(previous, 0, draftBallotWeight(coarse, false, 30))).toBe(false);
    expect(() => draftBallotWeight(coarse, false, 0)).toThrow();
    expect(() => draftBallotWeight(coarse, false, 5)).toThrow("minimum voting weight");
  });

  test("missing receipts or weights and another wallet or round never imply an unchanged vote", () => {
    expect(isUnchangedBallot(undefined, 0, weight)).toBe(false);
    expect(isUnchangedBallot({ option: 0 }, 0, weight)).toBe(false);
    expect(isUnchangedBallot(submitted, 0, undefined)).toBe(false);
    expect(isUnchangedBallot(submitted, null, submitted.weight)).toBe(false);
    expect(isUnchangedBallot(submitted, 0, { ...submitted.weight, roundId: 43n })).toBe(false);
    expect(isUnchangedBallot(submitted, 0, { ...submitted.weight, voter: "0x2222222222222222222222222222222222222222" })).toBe(false);
  });

  test("different exact amounts are changes even when the displayed percentage is identical", () => {
    const first = { ...weight, available: 1_000_000n, power: 1_000_000n, counted: 995_001n, unit: 1n };
    const next = { ...first, counted: 995_002n };
    expect(ballotWeightPercentage(first)).toBe(ballotWeightPercentage(next));
    expect(isUnchangedBallot({ option: 0, weight: first }, 0, next)).toBe(false);
  });
});
