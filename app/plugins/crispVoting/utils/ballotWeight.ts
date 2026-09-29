/**
 * The weight a vote counts when the voter keeps the random weight on: a uniformly random whole
 * number of ballot units in `[power - ⌊power / 100⌋, power]`, the top percent of the voting power.
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
export const randomBallotWeight = (power: bigint): bigint => {
  const lowest = power - power / 100n;
  return lowest + uniformBelow(power - lowest + 1n);
};

/**
 * `weight` as a percentage of `power`, rounded down to two decimals, for example `"99.47%"`.
 *
 * Rounded down, so a ballot below its full power never shows as 100%.
 */
export const formatWeightShare = (weight: bigint, power: bigint): string => {
  if (power === 0n || weight === power) return "100%";
  const hundredths = (weight * 10_000n) / power;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
};

/** A drawn weight that waits for the voter to accept it, in ballot units. */
export interface WeightConfirmation {
  /** The weight the ballot counts. */
  weight: bigint;
  /** The full voting power of the slot. */
  power: bigint;
}

/**
 * A uniformly random integer in `[0, bound)`.
 *
 * Rejection sampling over a 256-bit draw: a plain modulo favours low values whenever `bound` does
 * not divide the draw range.
 */
const uniformBelow = (bound: bigint): bigint => {
  const range = 2n ** 256n;
  const limit = range - (range % bound);
  let draw: bigint;
  do {
    draw = crypto.getRandomValues(new Uint8Array(32)).reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
  } while (draw >= limit);
  return draw % bound;
};
