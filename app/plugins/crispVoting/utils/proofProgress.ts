import { PROOF_STAGES } from "@crisp-e3/sdk";
import type { ProofStage } from "@crisp-e3/sdk";
import type { ThresholdBfvParamsPresetName } from "@interfold/sdk";

/** Where an in-flight ballot proof is: when each stage started, in `PROOF_STAGES` order. */
export type ProofProgressState = {
  isMask: boolean;
  /** The round's parameter set, which decides how the proving time splits across stages. */
  presetName: ThresholdBfvParamsPresetName;
  /** `Date.now()` at the start of each stage reached so far; the last entry is the current stage. */
  stageStartedAt: number[];
};

/**
 * What each stage proves, from the circuit it runs (see `PROOF_STAGES` in `@crisp-e3/sdk`).
 * Only the ballot stage reads differently for a mask: it proves the mask is zero instead of the
 * signature and the voting power. The key is tied to the committee only at the end: the fold
 * outputs the key commitment and `CRISPProgram` sets that public input to the round's committee key.
 */
export const proofStageLabel = (stage: ProofStage, isMask: boolean): string => {
  switch (stage) {
    // ct0 = pk0·u + e0 + k0·k1, every term bounded: the half of the ciphertext that holds the plaintext.
    case "encryption_ct0":
      return `Proving ${isMask ? "the mask" : "your ballot"} is correctly encrypted`;
    // ct1 = pk1·u + e1: no plaintext, and nothing here compares `u` with the first half.
    case "encryption_ct1":
      return "Proving the second part of the encryption is well formed";
    case "ballot":
      return isMask
        ? "Proving the mask adds zero to the slot it covers"
        : "Proving you signed this ballot and it is within your voting power";
    // Verifies both halves and asserts their randomness commitments are equal.
    case "encryption":
      return "Proving both parts come from the same encryption";
    // Verifies the ballot and encryption proofs cover one ciphertext; outputs the key commitment.
    case "fold":
      return "Combining everything into one proof, checked on chain against the committee key";
  }
};

/**
 * Relative proving time of each stage, measured per parameter set with bun, single-threaded, from
 * one secure-8192 mask. Only the ratios matter: the estimate scales them by how fast this device ran
 * the stages it has already finished. The split differs by preset, because the last two stages
 * verify proofs rather than BFV ciphertexts and barely change with the degree. A preset gaining
 * circuits in `./circuits` needs its own measurement here before it gets an estimate.
 */
const STAGE_WEIGHTS: Partial<Record<ThresholdBfvParamsPresetName, Record<ProofStage, number>>> = {
  SECURE_THRESHOLD_8192: { encryption_ct0: 66, encryption_ct1: 49, ballot: 115, encryption: 132, fold: 119 },
};

/**
 * Milliseconds left on the proof, or `undefined` when there is nothing to scale: before a stage
 * has finished there is no measurement of this device, and a preset without weights has no split.
 */
export const estimateRemainingMs = (
  { presetName, stageStartedAt }: ProofProgressState,
  now: number
): number | undefined => {
  const presetWeights = STAGE_WEIGHTS[presetName];
  const current = stageStartedAt.length - 1;
  if (!presetWeights || current < 1) return undefined;

  const weights = PROOF_STAGES.map((stage) => presetWeights[stage]);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const msPerWeight = (stageStartedAt[current] - stageStartedAt[0]) / sum(weights.slice(0, current));
  const remaining = msPerWeight * sum(weights.slice(current)) - (now - stageStartedAt[current]);
  return Math.max(remaining, 0);
};

/** "About 2 min left", "About 40 s left", or "Almost done" once the estimate runs out. */
export const formatRemaining = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 5) return "Almost done";
  if (seconds < 60) return `About ${Math.max(5, Math.round(seconds / 5) * 5)} s left`;
  return `About ${Math.round(seconds / 60)} min left`;
};
