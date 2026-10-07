import { describe, expect, test } from "bun:test";
import { bondedWeight, splitVotingPower } from "@/utils/bondedDelegation";

/**
 * The weight must match `BondedVotes._currentBondedWeight`. A higher figure shows an owner and its
 * delegate more voting power than the contract counts for them.
 */
describe("bondedWeight", () => {
  test("counts FOLD that is both bonded and locked once", () => {
    expect(bondedWeight(100n, { locked: 60n, held: 1_000n })).toBe(100n);
    expect(bondedWeight(100n, { locked: 100n, held: 1_000n })).toBe(100n);
  });

  test("adds the part of the lock that the bond does not cover", () => {
    expect(bondedWeight(100n, { locked: 250n, held: 1_000n })).toBe(250n);
  });

  test("caps the uncovered lock at the wallet balance, as after a slash", () => {
    expect(bondedWeight(40n, { locked: 250n, held: 30n })).toBe(70n);
  });
});

/** The rows on the Voting power page must add up to the total that `getVotes` returns. */
describe("splitVotingPower", () => {
  test("keeps represented weight out of the vesting remainder", () => {
    const split = splitVotingPower({
      total: 1_000n,
      lockVotes: 300n,
      bonded: 200n,
      represented: 150n,
      delegatedAway: false,
    });
    expect(split).toEqual({ lockedAndDelegated: 300n, bonded: 200n, vesting: 350n, represented: 150n });
  });

  test("shows no own bonded or vesting FOLD while a delegate represents the account", () => {
    const split = splitVotingPower({
      total: 450n,
      lockVotes: 300n,
      bonded: 200n,
      represented: 150n,
      delegatedAway: true,
    });
    expect(split.bonded).toBeUndefined();
    expect(split.vesting).toBeUndefined();
    expect(split.lockedAndDelegated! + split.represented!).toBe(450n);
  });

  test("leaves vesting unknown until the represented weight is known", () => {
    const split = splitVotingPower({ total: 1_000n, lockVotes: 300n, bonded: 200n, delegatedAway: false });
    expect(split.vesting).toBeUndefined();
  });

  test("clamps the remainder at zero when the parts were read after the total", () => {
    const split = splitVotingPower({
      total: 400n,
      lockVotes: 300n,
      bonded: 200n,
      represented: 0n,
      delegatedAway: false,
    });
    expect(split.vesting).toBe(0n);
  });
});
