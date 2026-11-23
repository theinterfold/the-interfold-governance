import type { Address } from "viem";

/**
 * What an Aztec ballot needs enrolled. A slot's weight reaches Aztec only through `enroll`, and a slot is enrolled the
 * first time a ballot needs it:
 *
 * - a vote needs the voter's own slot: the staging pass proves it in the census and the vote carries its weight;
 * - a mask needs its target slot (the proof reads the target's census leaf) and the voter's own slot (the mask is staged
 *   with the masker's own staging secret, which can be bound only for an enrolled slot).
 */
export type BallotNeed = { kind: "vote"; own: Address } | { kind: "mask"; own: Address; target: Address };

/** The slots a ballot needs enrolled, own slot first, each once (addresses compare case-insensitively). */
export const slotsNeeded = (need: BallotNeed): Address[] => {
  const wanted = need.kind === "mask" ? [need.own, need.target] : [need.own];
  const seen = new Set<string>();
  return wanted.filter((slot) => {
    const key = slot.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** The needed slots that are not enrolled on Aztec yet: what to ask the CRISP server to enroll. */
export const slotsToEnroll = (need: BallotNeed, enrolled: readonly Address[]): Address[] => {
  const done = new Set(enrolled.map((slot) => slot.toLowerCase()));
  return slotsNeeded(need).filter((slot) => !done.has(slot.toLowerCase()));
};
