import { describe, expect, test } from "bun:test";
import { getAddress, zeroAddress } from "viem";
import { bondedDelegateTarget, bondedWeight, splitVotingPower } from "@/utils/bondedDelegation";

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

describe("bondedDelegateTarget", () => {
  // Hex letters, so that the checksummed and the lowercase forms differ.
  const owner = getAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
  const delegate = getAddress("0x2222222222222222222222222222222222222222");
  const pending = getAddress("0x3333333333333333333333333333333333333333");
  const other = getAddress("0x4444444444444444444444444444444444444444");

  /** This runs during render: a throw on a partly typed address unmounts the page. */
  test("refuses a partly typed address without throwing", () => {
    for (const typed of ["0x", "0x12", other.slice(0, 41)]) {
      const result = bondedDelegateTarget(typed, owner, delegate, pending);
      expect(result.target).toBeUndefined();
      expect(result.problem).toBeDefined();
    }
  });

  /**
   * The contract treats zero and the owner as a withdrawal, and the current delegate and the
   * address already asked as no change. A request for any of them would not do what the owner wants.
   */
  test("refuses an address that the contract would not treat as a new request", () => {
    for (const typed of [zeroAddress, owner.toLowerCase(), delegate, pending]) {
      const result = bondedDelegateTarget(typed, owner, delegate, pending);
      expect(result.target).toBeUndefined();
      expect(result.problem).toBeDefined();
    }
  });

  test("accepts any other address, with the surrounding spaces removed", () => {
    expect(bondedDelegateTarget(`  ${other}  `, owner, delegate, pending)).toEqual({ target: other });
  });
});
