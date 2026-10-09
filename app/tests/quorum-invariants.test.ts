import { expect, test, describe } from "bun:test";
import {
  RATIO_BASE,
  computeQuorum,
  tallyCountToTokens,
  voteScale,
  meetsSupportThreshold,
} from "@/plugins/crispVoting/utils/quorum";
import { CreditsMode } from "@/plugins/crispVoting/utils/types";

/**
 * The app is the third leg of the vote-scaling sync (CRISP program / `CrispVoting._canExecute` /
 * this file). These tests pin the app's half against the on-chain formula, which is mirrored
 * here independently so a change to `quorum.ts` alone cannot make both sides agree by accident.
 *
 * Contract reference (`CrispVoting._canExecute`), with `divisor = votingPowerDivisorOf(e3Id)`:
 *   totalVotes * divisor * RATIO_BASE >= minParticipation * totalVotingPower
 * and a zero divisor or zero total voting power never passes.
 */
function contractQuorumReached(
  totalVotes: bigint,
  totalVotingPower: bigint,
  minParticipation: number,
  divisor: bigint
): boolean {
  if (totalVotingPower === 0n || divisor === 0n) return false;
  return totalVotes * divisor * 100n >= BigInt(minParticipation) * totalVotingPower;
}

describe("INVARIANT: RATIO_BASE matches the contract", () => {
  test("is 100, so minParticipation is a whole percentage", () => {
    // CrispVoting: `uint256 internal constant RATIO_BASE = 100;`
    expect(RATIO_BASE).toBe(100n);
  });
});

describe("INVARIANT: voteScale is the divisor CRISP recorded for the round", () => {
  test("token credit mode scales by the recorded divisor, whatever the token's decimals", () => {
    for (const divisor of [1n, 10n, 10n ** 12n, 10n ** 17n, 123_456_789n]) {
      expect(voteScale(CreditsMode.CUSTOM, divisor)).toBe(divisor);
    }
  });

  test("an unknown or zero divisor yields no scale instead of a guess", () => {
    expect(voteScale(CreditsMode.CUSTOM, undefined)).toBeUndefined();
    expect(voteScale(CreditsMode.CUSTOM, 0n)).toBeUndefined();
  });

  test("CONSTANT credit mode submits raw counts and is never scaled", () => {
    expect(voteScale(CreditsMode.CONSTANT, 10n ** 12n)).toBe(1n);
    expect(voteScale(CreditsMode.CONSTANT, undefined)).toBe(1n);
  });
});

describe("INVARIANT: computeQuorum agrees with the on-chain formula", () => {
  const supply = 1000n * 10n ** 18n;
  const divisor = 10n ** 17n;

  test("passes at exactly the threshold and fails one unit below", () => {
    // 50% of 1000e18 == 500e18 raw == 5000 units of 1e17.
    expect(computeQuorum(5000n, supply, 50, CreditsMode.CUSTOM, divisor)?.reached).toBe(true);
    expect(computeQuorum(4999n, supply, 50, CreditsMode.CUSTOM, divisor)?.reached).toBe(false);
  });

  test("the same tally reaches or misses quorum depending on the recorded divisor", () => {
    expect(computeQuorum(5000n, supply, 50, CreditsMode.CUSTOM, 10n ** 17n)?.reached).toBe(true);
    expect(computeQuorum(5000n, supply, 50, CreditsMode.CUSTOM, 10n ** 16n)?.reached).toBe(false);
  });

  test("matches the contract across a grid of inputs", () => {
    for (const d of [1n, 10n ** 6n, 10n ** 12n, 10n ** 17n]) {
      for (const minParticipation of [0, 1, 33, 50, 100]) {
        for (const votes of [0n, 1n, 999n, 5000n, 10_000n, 10n ** 12n]) {
          const app = computeQuorum(votes, supply, minParticipation, CreditsMode.CUSTOM, d);
          expect(app?.reached).toBe(contractQuorumReached(votes, supply, minParticipation, d));
        }
      }
    }
  });

  test("a missing or zero divisor returns null rather than a figure", () => {
    expect(computeQuorum(5000n, supply, 50, CreditsMode.CUSTOM, undefined)).toBeNull();
    expect(computeQuorum(5000n, supply, 50, CreditsMode.CUSTOM, 0n)).toBeNull();
  });

  test("zero voting power returns null rather than dividing by zero", () => {
    expect(computeQuorum(100n, 0n, 50, CreditsMode.CUSTOM, divisor)).toBeNull();
  });

  test("minParticipation 0 disables quorum, matching the contract", () => {
    expect(computeQuorum(0n, supply, 0, CreditsMode.CUSTOM, divisor)?.reached).toBe(true);
  });

  test("quorum is monotonic in turnout", () => {
    let seenReached = false;
    for (const votes of [0n, 1000n, 2500n, 4999n, 5000n, 9000n]) {
      const reached = computeQuorum(votes, supply, 50, CreditsMode.CUSTOM, divisor)!.reached;
      if (seenReached) expect(reached).toBe(true); // never un-reaches
      seenReached ||= reached;
    }
    expect(seenReached).toBe(true);
  });
});

describe("INVARIANT: tallyCountToTokens reverses the scaling", () => {
  test("counts render as count * divisor raw units, formatted with the token decimals", () => {
    expect(tallyCountToTokens(5000n, CreditsMode.CUSTOM, 18, 10n ** 17n)).toBe(500);
    expect(tallyCountToTokens(1n, CreditsMode.CUSTOM, 18, 10n ** 17n)).toBe(0.1);
    expect(tallyCountToTokens(7n, CreditsMode.CUSTOM, 18, 10n ** 18n)).toBe(7);
  });

  test("an unknown divisor renders nothing", () => {
    expect(tallyCountToTokens(5000n, CreditsMode.CUSTOM, 18, undefined)).toBeUndefined();
  });

  test("CONSTANT mode counts are raw credits", () => {
    expect(tallyCountToTokens(42n, CreditsMode.CONSTANT, 18, undefined)).toBe(42);
  });
});

describe("INVARIANT: meetsSupportThreshold mirrors CrispVoting._supported (INV-22)", () => {
  test("the 50 default is a strict simple majority — a tie is a rejection", () => {
    expect(meetsSupportThreshold(7n, 7n, 50n)).toBe(false);
    expect(meetsSupportThreshold(8n, 7n, 50n)).toBe(true);
    expect(meetsSupportThreshold(0n, 0n, 50n)).toBe(false);
  });

  test("landing exactly ON the threshold fails; one unit above passes", () => {
    // (100 - 51) * 5100 === 51 * 4900 — not strictly greater
    expect(meetsSupportThreshold(5100n, 4900n, 51n)).toBe(false);
    expect(meetsSupportThreshold(5101n, 4899n, 51n)).toBe(true);
  });

  test("abstain never contributes to support (only yes and no enter the formula)", () => {
    // the helper takes only yes/no by construction; pin the call shape
    expect(meetsSupportThreshold(5n, 3n, 50n)).toBe(true);
  });
});
