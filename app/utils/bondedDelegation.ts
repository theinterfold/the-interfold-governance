/**
 * The voting power that a bonded delegation moves, as `BondedVotes` counts it now: the bonded FOLD,
 * plus the vesting FOLD that the bond does not cover, capped at the wallet balance.
 *
 * Mirrors `BondedVotes._currentBondedWeight`. A bond satisfies a vesting lock, so FOLD that is both
 * bonded and locked counts once. The cap matters after a slash: the bond shrinks, the lock does not,
 * and the wallet can hold less than the lock that is left.
 *
 * @param bonded `BondedCheckpoints.bonded(account)`.
 * @param vesting The token's `lockedBalanceOf` and `balanceOf` for the account. Omit it when the votes
 *   source is the token itself: vesting FOLD is then wallet FOLD, which follows the token's own
 *   delegation and is no part of the bonded weight.
 */
export function bondedWeight(bonded: bigint, vesting?: { locked: bigint; held: bigint }): bigint {
  if (!vesting || vesting.locked <= bonded) return bonded;
  const unbonded = vesting.locked - bonded;
  return bonded + (unbonded < vesting.held ? unbonded : vesting.held);
}

export type VotingPowerSplit = {
  /** Escrow locks delegated to the account: the adapter's `getVotes`. */
  lockedAndDelegated?: bigint;
  /** The account's own bonded FOLD. Absent while a delegate represents it. */
  bonded?: bigint;
  /** The account's own vesting FOLD, as the remainder of the total. Absent while a delegate represents it. */
  vesting?: bigint;
  /** The bonded weight of the owners that the account represents. */
  represented?: bigint;
};

/**
 * Splits `BondedVotes.getVotes` into the parts that it adds:
 *
 *   getVotes = adapter.getVotes                (escrow locks delegated to the account)
 *            + bonded + vesting                 unless a delegate represents the account
 *            + the bonded weight of each owner that the account represents
 *
 * Vesting is the remainder, so the rows add up to the total on the page although the parts come
 * from separate reads. Clamped at zero: a bond or a claim between two reads could otherwise show a
 * negative remainder for one render.
 *
 * @param represented Undefined while unknown, which leaves the remainder unknown too: a guess of
 *   zero would show represented weight as vesting until the owners load.
 * @param delegatedAway A delegate represents the account, so its own bonded and vesting FOLD count
 *   for the delegate and are not part of this total.
 */
export function splitVotingPower({
  total,
  lockVotes,
  bonded,
  represented,
  delegatedAway,
}: {
  total?: bigint;
  lockVotes?: bigint;
  bonded?: bigint;
  represented?: bigint;
  delegatedAway: boolean;
}): VotingPowerSplit {
  if (delegatedAway) return { lockedAndDelegated: lockVotes, represented };

  let vesting: bigint | undefined;
  if (total !== undefined && lockVotes !== undefined && bonded !== undefined && represented !== undefined) {
    const counted = lockVotes + bonded + represented;
    vesting = total > counted ? total - counted : 0n;
  }
  return { lockedAndDelegated: lockVotes, bonded, vesting, represented };
}
