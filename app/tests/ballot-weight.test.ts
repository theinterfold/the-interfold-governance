import { describe, expect, test } from "bun:test";
import {
  ballotWeightPercentage,
  chooseBallotWeight,
  reviewedVote,
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
    expect(ballotWeightPercentage({ ...weight, available: 1n, counted: 1n, unit, power: 111_100n * 10n ** 18n })).toBe(
      "99.01%"
    );
    expect(ballotWeightPercentage({ counted: 999_999n, unit: 1n, power: 1_000_000n })).toBe("99.99%");
    expect(ballotWeightPercentage({ counted: 1n, unit: 1n, power: 1n })).toBe("100.00%");
  });
});
