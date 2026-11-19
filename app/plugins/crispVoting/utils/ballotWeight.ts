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
  /** A manually selected whole percentage, from 1 to 100. Mutually exclusive with randomization. */
  percentage?: number;
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
 * `[available - ⌊available / 100⌋, available - 1]` when `randomize` is on, a selected percentage
 * rounded down to whole ballot units when specified, or otherwise the full `available` amount.
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
export function chooseBallotWeight(available: bigint, randomize: boolean, percentage?: number): bigint {
  if (available <= 0n) throw new Error("No voting power is available for this ballot.");
  if (percentage !== undefined) {
    if (randomize || !Number.isInteger(percentage) || percentage < 1 || percentage > 100)
      throw new Error("Choose a whole percentage from 1% to 100%.");
    const counted = (available * BigInt(percentage)) / 100n;
    if (counted === 0n) throw new Error("This percentage is below the round’s minimum voting weight. Choose a higher percentage.");
    return counted;
  }
  const maxReduction = available / 100n;
  if (!randomize || maxReduction === 0n) return available;
  return available - 1n - randomBelow(maxReduction);
}

/** Resolve the displayed draft without drawing a new random amount. */
export function draftBallotWeight(
  balance: BallotWeight | undefined,
  randomize: boolean,
  percentage?: number
): BallotWeight | undefined {
  if (!balance) return undefined;
  return {
    ...balance,
    counted: randomize ? balance.counted : chooseBallotWeight(balance.available, false, percentage),
    randomize,
    percentage: randomize ? undefined : percentage,
  };
}

/** Compare actual ballot units, not the rounded percentage or the selected privacy mode. */
export function isUnchangedBallot(
  current: { option: number | null; weight?: BallotWeight } | undefined,
  option: number | null,
  weight: BallotWeight | undefined
): boolean {
  const previous = current?.weight;
  return option !== null && current?.option === option && !!previous && !!weight &&
    previous.roundId === weight.roundId && previous.voter.toLowerCase() === weight.voter.toLowerCase() &&
    previous.unit === weight.unit && previous.counted === weight.counted;
}

/** Re-roll in the privacy band, changing the visible percentage whenever precision allows. */
export function rerandomizeBallotWeight(weight: BallotWeight): BallotWeight {
  const choices = weight.available / 100n;
  const lower = weight.available - choices;
  const upper = weight.available - 1n;
  const scale = weight.unit * 10_000n;
  const share = (weight.counted * scale) / weight.power;
  const ceilDivide = (value: bigint) => (value + scale - 1n) / scale;
  const bucketLower = ceilDivide(share * weight.power);
  const bucketUpper = ceilDivide((share + 1n) * weight.power) - 1n;
  const excludedLower = bucketLower > lower ? bucketLower : lower;
  const excludedUpper = bucketUpper < upper ? bucketUpper : upper;
  const excluded = excludedUpper >= excludedLower ? excludedUpper - excludedLower + 1n : 0n;
  let counted: bigint;
  if (choices > excluded) {
    const sample = lower + randomBelow(choices - excluded);
    counted = excluded > 0n && sample >= excludedLower ? sample + excluded : sample;
  } else if (choices > 1n) {
    // If all possible weights display the same percentage, still change the exact amount.
    const sample = lower + randomBelow(choices - 1n);
    counted = sample >= weight.counted ? sample + 1n : sample;
  } else {
    counted = chooseBallotWeight(weight.available, true);
  }
  return { ...weight, counted, randomize: true, percentage: undefined };
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
    (weight.percentage !== undefined
      ? weight.randomize || weight.counted !== chooseBallotWeight(available, false, weight.percentage)
      : weight.randomize
      ? available >= 100n
        ? weight.counted >= available || weight.counted * 100n < available * 99n
        : weight.counted !== available
      : weight.counted !== available)
  )
    throw new Error("Your voting power changed or the review is invalid. Review the ballot again.");
  if (!Number.isInteger(option) || option < 0 || option >= numOptions) throw new Error("Select a valid vote option.");
  return Array.from({ length: numOptions }, (_, i) => (i === option ? Number(weight.counted) : 0));
}
