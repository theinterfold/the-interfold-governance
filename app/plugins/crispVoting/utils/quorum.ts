import { formatUnits } from "viem";
import { CreditsMode } from "./types";

/** The denominator used by the contract for ratio (percentage) calculations. */
export const RATIO_BASE = 100n;

/**
 * Raw token units that one tally count stands for. CRISP weighs each ballot as
 * `floor(rawPower / divisor)` with the divisor it recorded for the round
 * (`votingPowerDivisorOf(e3Id)`), so a tally count is in units of `divisor` raw tokens.
 * CONSTANT mode submits raw credit counts and is not scaled.
 *
 * `undefined` while the round's divisor is unknown (not read yet, or no E3 recorded one). Callers
 * must show nothing scaled in that case rather than guess a factor. This MUST agree with the
 * divisor `CrispVoting._canExecute` reads from the CRISP program.
 */
export function voteScale(
  creditMode: CreditsMode | number | undefined,
  divisor: bigint | undefined
): bigint | undefined {
  if (creditMode === CreditsMode.CONSTANT) return 1n;
  return divisor !== undefined && divisor > 0n ? divisor : undefined;
}

export interface QuorumInfo {
  /** Whether turnout met the quorum requirement. */
  reached: boolean;
  /** Turnout as a percentage of total voting power (0-100). */
  turnoutPct: number;
  /** Required quorum (minParticipation) as a percentage (0-100). */
  requiredPct: number;
}

/**
 * Compute quorum status, mirroring `CrispVoting._canExecute` exactly:
 *
 *   totalVotes * divisor * RATIO_BASE >= minParticipation * totalVotingPower
 *
 * The tally is recorded in units of the round's divisor, so `totalVotes` is scaled back up by it
 * to be comparable with the raw token supply (rather than dividing the supply down, which would
 * truncate). Returns `null` without a divisor: the contract treats a missing one as a failed quorum,
 * and the app must not guess one.
 *
 * @param totalVotes sum of the on-chain tally counts (units of `divisor`)
 * @param totalVotingPower total voting power at the snapshot timepoint, raw units
 *        (`getPastTotalSupply(snapshotBlock)`)
 * @param minParticipation quorum requirement as a percentage (0-100)
 * @param divisor the round's recorded `votingPowerDivisorOf(e3Id)`
 */
export function computeQuorum(
  totalVotes: bigint,
  totalVotingPower: bigint,
  minParticipation: number,
  creditMode: CreditsMode | number | undefined,
  divisor: bigint | undefined
): QuorumInfo | null {
  if (!totalVotingPower || totalVotingPower <= 0n) return null;

  const scale = voteScale(creditMode, divisor);
  if (scale === undefined) return null;
  const scaledVotes = totalVotes * scale;
  const reached = scaledVotes * RATIO_BASE >= BigInt(Math.round(minParticipation)) * totalVotingPower;
  const turnoutPct = (Number(scaledVotes) / Number(totalVotingPower)) * 100;

  return { reached, turnoutPct, requiredPct: minParticipation };
}

/**
 * Whether yes strictly clears the support threshold over the decisive votes,
 * mirroring `CrispVoting._supported` exactly:
 *
 *   (RATIO_BASE - threshold) * yes > threshold * no
 *
 * At the 50 default this is `yes > no`: a tie is a rejection (INV-22). Abstain
 * counts toward participation, never toward support.
 *
 * @param yes the yes count, tally index 0
 * @param no the no count, tally index 1
 * @param supportThreshold the proposal's FROZEN threshold (% of RATIO_BASE) — a
 *        proposal settles under the rules at creation (INV-33), so pass
 *        `parameters.supportThreshold`, never the live setting.
 */
export function meetsSupportThreshold(yes: bigint, no: bigint, supportThreshold: bigint): boolean {
  return (RATIO_BASE - supportThreshold) * yes > supportThreshold * no;
}

/**
 * Convert a tally count (or a served balance) into a human-readable token amount:
 *   tokens = count * divisor / 10^decimals
 * For CONSTANT mode the tally is a raw credit count and is returned as-is. `undefined` without a
 * divisor, so nothing scaled is shown.
 */
export function tallyCountToTokens(
  count: bigint,
  creditMode: CreditsMode | number | undefined,
  decimals: number,
  divisor: bigint | undefined
): number | undefined {
  const scale = voteScale(creditMode, divisor);
  if (scale === undefined) return undefined;
  if (creditMode === CreditsMode.CONSTANT) return Number(count);
  return Number(formatUnits(count * scale, decimals));
}
