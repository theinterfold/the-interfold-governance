import { expect, test, describe } from "bun:test";
import { RATIO_BASE, computeQuorum, tallyCountToTokens, voteScale } from "@/plugins/crispVoting/utils/quorum";
import { CreditsMode } from "@/plugins/crispVoting/utils/types";

/**
 * The app is the third leg of the vote-scaling sync (CRISP server / `CrispVoting._tallyScale()`
 * / this file). These tests pin the app's half against the on-chain formula, which is mirrored
 * here independently so a change to `quorum.ts` alone cannot make both sides agree by accident.
 *
 * Contract reference (`CrispVoting._canExecute`):
 *   totalVotes * _tallyScale() * RATIO_BASE >= minParticipation * totalVotingPower
 *   _tallyScale() = decimals > 1 ? 10 ** (decimals - 1) : 1
 */
function contractTallyScale(decimals: number): bigint {
  return decimals > 1 ? 10n ** BigInt(decimals - 1) : 1n;
}

function contractQuorumReached(
  totalVotes: bigint,
  totalVotingPower: bigint,
  minParticipation: number,
  decimals: number
): boolean {
  if (totalVotingPower === 0n) return false;
  return totalVotes * contractTallyScale(decimals) * 100n >= BigInt(minParticipation) * totalVotingPower;
}

describe("INVARIANT: RATIO_BASE matches the contract", () => {
  test("is 100, so minParticipation is a whole percentage", () => {
    // CrispVoting: `uint256 internal constant RATIO_BASE = 100;`
    expect(RATIO_BASE).toBe(100n);
  });
});

describe("INVARIANT: voteScale mirrors CrispVoting._tallyScale()", () => {
  test("is 10^(decimals-1) for token credit mode", () => {
    for (const d of [2, 6, 8, 18, 27]) {
      expect(voteScale(CreditsMode.CUSTOM, d)).toBe(contractTallyScale(d));
    }
  });

  test("18-decimal FOLD scales by 10^17", () => {
    expect(voteScale(CreditsMode.CUSTOM, 18)).toBe(10n ** 17n);
  });

  test("0- and 1-decimal tokens are unscaled, as on-chain", () => {
    expect(voteScale(CreditsMode.CUSTOM, 0)).toBe(1n);
    expect(voteScale(CreditsMode.CUSTOM, 1)).toBe(1n);
  });

  test("CONSTANT credit mode submits raw counts and is never scaled", () => {
    expect(voteScale(CreditsMode.CONSTANT, 18)).toBe(1n);
  });
});

describe("INVARIANT: computeQuorum agrees with the on-chain formula", () => {
  const supply = 1000n * 10n ** 18n;

  test("passes at exactly the threshold and fails one unit below", () => {
    // 50% of 1000e18 == 500e18 raw == 5000 scaled units at 18 decimals.
    expect(computeQuorum(5000n, supply, 50, CreditsMode.CUSTOM, 18)?.reached).toBe(true);
    expect(computeQuorum(4999n, supply, 50, CreditsMode.CUSTOM, 18)?.reached).toBe(false);
  });

  test("matches the contract across a grid of inputs", () => {
    for (const decimals of [1, 6, 18]) {
      for (const minParticipation of [0, 1, 33, 50, 100]) {
        for (const votes of [0n, 1n, 999n, 5000n, 10_000n]) {
          const app = computeQuorum(votes, supply, minParticipation, CreditsMode.CUSTOM, decimals);
          const chain = contractQuorumReached(votes, supply, minParticipation, decimals);
          expect(app?.reached).toBe(chain);
        }
      }
    }
  });

  test("zero voting power returns null rather than dividing by zero", () => {
    expect(computeQuorum(100n, 0n, 50, CreditsMode.CUSTOM, 18)).toBeNull();
  });

  test("minParticipation 0 disables quorum, matching the contract", () => {
    expect(computeQuorum(0n, supply, 0, CreditsMode.CUSTOM, 18)?.reached).toBe(true);
  });

  test("quorum is monotonic in turnout", () => {
    let seenReached = false;
    for (const votes of [0n, 1000n, 2500n, 4999n, 5000n, 9000n]) {
      const reached = computeQuorum(votes, supply, 50, CreditsMode.CUSTOM, 18)!.reached;
      if (seenReached) expect(reached).toBe(true); // never un-reaches
      seenReached ||= reached;
    }
    expect(seenReached).toBe(true);
  });
});

describe("INVARIANT: tallyCountToTokens reverses the scaling", () => {
  test("scaled counts render as tokens at 1 decimal of precision", () => {
    // scaledCount * 10^(d-1) / 10^d === scaledCount / 10
    expect(tallyCountToTokens(5000n, CreditsMode.CUSTOM, 18)).toBe(500);
    expect(tallyCountToTokens(1n, CreditsMode.CUSTOM, 18)).toBe(0.1);
  });

  test("CONSTANT mode counts are raw credits", () => {
    expect(tallyCountToTokens(42n, CreditsMode.CONSTANT, 18)).toBe(42);
  });
});
