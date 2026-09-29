import { describe, expect, test } from "bun:test";
import { formatWeightShare, randomBallotWeight } from "@/plugins/crispVoting/utils/ballotWeight";

/**
 * The drawn weight must stay in the top percent of the voting power. Above the power, the circuit
 * rejects the ballot after minutes of proving. Below the band, the vote silently loses weight.
 */
describe("randomBallotWeight", () => {
  const draws = (power: bigint) => Array.from({ length: 400 }, () => randomBallotWeight(power));

  test("stays in [power - floor(power / 100), power]", () => {
    for (const power of [1n, 99n, 100n, 101n, 150n, 12_345n, 2n ** 49n]) {
      const lowest = power - power / 100n;
      for (const weight of draws(power)) {
        expect(weight >= lowest && weight <= power).toBe(true);
      }
    }
  });

  test("reaches both ends of the band", () => {
    // The band of 150 is {149, 150}. 400 draws miss one end with probability 2^-399.
    expect(new Set(draws(150n))).toEqual(new Set([149n, 150n]));
  });

  test("keeps a power below 100 units whole, because its band holds no smaller integer", () => {
    expect(new Set(draws(99n))).toEqual(new Set([99n]));
  });
});

describe("formatWeightShare", () => {
  test("rounds down, so a weight below the full power never shows as 100%", () => {
    expect(formatWeightShare(12_344n, 12_345n)).toBe("99.99%");
    expect(formatWeightShare(12_222n, 12_345n)).toBe("99.00%");
    expect(formatWeightShare(12_345n, 12_345n)).toBe("100%");
  });
});
