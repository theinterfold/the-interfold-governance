import type { Hex } from "viem";

/** What the votes contract on Aztec has logged for a round, reduced to what the ballot gate needs. */
export type AztecRoundFacts = {
  opened: boolean;
  keyPublished: boolean;
  closed: boolean;
  /** Unix seconds. */
  now: number;
  inputStart: number;
  inputEnd: number;
};

/** Whether the round accepts a ballot, and if not, why. Mirrors what `cast` and `open_round`/`publish_key` enforce. */
export const aztecRoundGate = (round: AztecRoundFacts): { open: true } | { open: false; reason: string } => {
  if (!round.opened) return { open: false, reason: "This round has not reached Aztec yet. Try again in a few minutes." };
  if (!round.keyPublished) return { open: false, reason: "The committee key has not reached Aztec yet, so the round is not accepting ballots." };
  if (round.closed) return { open: false, reason: "This round is closed on Aztec." };
  if (round.now < round.inputStart) return { open: false, reason: "The voting window has not opened yet." };
  if (round.now >= round.inputEnd) return { open: false, reason: "The voting window has closed." };
  return { open: true };
};

/**
 * The committee key on Aztec (the KEY message's commitment) must be the commitment Interfold published for the round,
 * or a ballot would be encrypted to a key the votes contract refuses.
 */
export const checkAztecCommitteeKey = (onAztec: Hex | undefined, onEthereum: Hex): { ok: true } | { ok: false; reason: string } => {
  if (onAztec === undefined) return { ok: false, reason: "The committee key has not reached Aztec yet." };
  if (BigInt(onAztec) !== BigInt(onEthereum)) {
    return { ok: false, reason: "The committee key on Aztec is not the one Interfold published for this round." };
  }
  return { ok: true };
};

/** One committed input, as the activity list shows it. */
export type AztecActivityEntry = { index: number; txHash: string; blockNumber: number };

/** Aztec's `INPUT_COMMITTED` logs as the activity list, newest first. Votes, re-votes and masks look the same. */
export const toActivityEntries = (
  logs: readonly { index: number; origin: { txHash: string; blockNumber: number } }[]
): AztecActivityEntry[] =>
  logs
    .map((log) => ({ index: log.index, txHash: log.origin.txHash, blockNumber: log.origin.blockNumber }))
    .sort((a, b) => b.index - a.index);
