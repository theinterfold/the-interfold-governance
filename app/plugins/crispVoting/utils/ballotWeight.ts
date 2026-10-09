/** A single in-memory review. Never save clear ballot weights with the encrypted proof. */
export interface BallotWeight {
  roundId: bigint;
  voter: string;
  /** The voting power the ballot can spend, in ballot units: `power / unit`, rounded down. */
  available: bigint;
  /**
   * The full voting power of the slot at the round's snapshot, in raw token units (the credits for
   * CONSTANT credits). It includes the remainder that whole ballot units leave out of `available`.
   */
  power: bigint;
  /** The weight the ballot counts, in ballot units. */
  counted: bigint;
  /** The voter kept the random weight on. */
  randomize: boolean;
  /** Raw token units in one ballot unit: the divisor CRISP recorded for the round (1 for CONSTANT credits). */
  unit: bigint;
  /** Decimals of the raw amount `counted * unit`. */
  decimals: number;
}

/** Uniform cryptographic sampling without modulo bias or floating-point rounding. */
function randomBelow(limit: bigint): bigint {
  if (limit === 1n) return 0n;
  const bits = (limit - 1n).toString(2).length;
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  const mask = (1 << (((bits - 1) % 8) + 1)) - 1;
  for (;;) {
    crypto.getRandomValues(bytes);
    bytes[0] &= mask;
    const value = bytes.reduce((total, byte) => (total << 8n) | BigInt(byte), 0n);
    if (value < limit) return value;
  }
}

/**
 * The weight a vote counts: a uniformly random whole number of ballot units in
 * `[available - ⌊available / 100⌋, available - 1]` when `randomize` is on, else `available`.
 * A power below 100 units has no smaller whole number in that band, so it counts whole.
 *
 * Every slot's voting power is public, and the tally publishes the total of each option. A ballot
 * that counts exactly its voting power turns the totals into a subset-sum problem: when the powers
 * are distinct, few combinations of slots give the published totals, and the combination that does
 * can show how each voter voted. A random weight removes the exact match, and the voter loses at
 * most 1% of their weight.
 *
 * The proof still names the full voting power: the census leaf, or public input 4 of an ONCHAIN
 * round. The circuit only requires the weight of the chosen option not to exceed it.
 */
export function chooseBallotWeight(available: bigint, randomize: boolean): bigint {
  if (available <= 0n) throw new Error("No voting power is available for this ballot.");
  const maxReduction = available / 100n;
  if (!randomize || maxReduction === 0n) return available;
  return available - 1n - randomBelow(maxReduction);
}

/**
 * The counted weight as a percentage of the full voting power, rounded down to two decimals, for
 * example `"99.47%"`. It compares tokens, not ballot units, so it also shows the remainder that whole
 * units leave out. Rounded down, so a ballot that loses any power never shows as 100%.
 */
export function ballotWeightPercentage({
  counted,
  unit,
  power,
}: Pick<BallotWeight, "counted" | "unit" | "power">): string {
  const hundredths = (counted * unit * 10_000n) / power;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}

/** Recheck the reviewed amount against the authoritative balance, without re-randomizing it. */
export function reviewedVote(
  weight: BallotWeight | undefined,
  available: bigint,
  roundId: bigint,
  voter: string,
  option: number,
  numOptions: number
): number[] {
  if (
    !weight ||
    weight.roundId !== roundId ||
    weight.voter.toLowerCase() !== voter.toLowerCase() ||
    weight.available !== available ||
    weight.counted <= 0n ||
    weight.counted > available ||
    weight.counted > BigInt(Number.MAX_SAFE_INTEGER) ||
    (weight.randomize
      ? available >= 100n
        ? weight.counted >= available || weight.counted * 100n < available * 99n
        : weight.counted !== available
      : weight.counted !== available)
  )
    throw new Error("Your voting power changed or the review is invalid. Review the ballot again.");
  if (!Number.isInteger(option) || option < 0 || option >= numOptions) throw new Error("Select a valid vote option.");
  return Array.from({ length: numOptions }, (_, i) => (i === option ? Number(weight.counted) : 0));
}
