import { CreditsMode } from "./types";

/** The denominator used by the contract for ratio (percentage) calculations. */
export const RATIO_BASE = 100n;

/**
 * The factor by which each voter's power is divided before being submitted to
 * CRISP (see `useCrispServer`): in token (CUSTOM) credit mode the CRISP server
 * keeps 1 decimal of precision, i.e. each voter's power is divided by
 * `10^(decimals-1)`. CONSTANT mode submits raw credit counts and is not scaled.
 *
 * This MUST stay in sync with `CrispVoting._tallyScale()` on-chain and with the
 * CRISP server's snapshot scaling.
 */
export function voteScale(creditMode: CreditsMode | number | undefined, decimals: number): bigint {
  if (creditMode === CreditsMode.CONSTANT) return 1n;
  return decimals > 1 ? 10n ** BigInt(decimals - 1) : 1n;
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
 * Compute quorum status, mirroring `CrispVoting._hasSucceeded` exactly:
 *
 *   totalVotes * voteScale * RATIO_BASE >= minParticipation * totalVotingPower
 *
 * The tally is recorded in scaled vote units, so `totalVotes` is scaled back up
 * by `voteScale` to be comparable with the raw token supply (rather than dividing
 * the supply down, which would truncate).
 *
 * @param totalVotes sum of the (scaled) on-chain tally counts
 * @param totalVotingPower total voting power at the snapshot timepoint, raw units
 *        (`getPastTotalSupply(snapshotBlock)`)
 * @param minParticipation quorum requirement as a percentage (0-100)
 */
export function computeQuorum(
  totalVotes: bigint,
  totalVotingPower: bigint,
  minParticipation: number,
  creditMode: CreditsMode | number | undefined,
  decimals: number
): QuorumInfo | null {
  if (!totalVotingPower || totalVotingPower <= 0n) return null;

  const scale = voteScale(creditMode, decimals);
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
 * @param yes the (scaled) yes count, tally index 0
 * @param no the (scaled) no count, tally index 1
 * @param supportThreshold the proposal's FROZEN threshold (% of RATIO_BASE) — a
 *        proposal settles under the rules at creation (INV-33), so pass
 *        `parameters.supportThreshold`, never the live setting.
 */
export function meetsSupportThreshold(yes: bigint, no: bigint, supportThreshold: bigint): boolean {
  return (RATIO_BASE - supportThreshold) * yes > supportThreshold * no;
}

/**
 * Convert a scaled tally count back into a human-readable token amount.
 * Reverses the `10^(decimals-1)` vote scaling and the token's own decimals:
 *   tokens = scaledCount * voteScale / 10^decimals = scaledCount / 10
 * For CONSTANT mode the tally is a raw credit count and is returned as-is.
 */
export function tallyCountToTokens(
  scaledCount: bigint,
  creditMode: CreditsMode | number | undefined,
  decimals: number
): number {
  if (creditMode === CreditsMode.CONSTANT) return Number(scaledCount);
  if (decimals <= 1) return Number(scaledCount) / 10 ** decimals;
  return Number(scaledCount) / 10;
}
