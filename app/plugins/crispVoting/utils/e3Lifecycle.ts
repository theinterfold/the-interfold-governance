import { E3Stage } from "../hooks/useE3Status";

export const E3_STEPS = [
  "Requested",
  "Committee selected",
  "Key generation",
  "Input window",
  "Compute",
  "Decryption",
  "Published",
] as const;
export type NetworkStepState = "complete" | "current" | "pending" | "unknown";
export interface E3Lifecycle {
  phase: string;
  description: string;
  published: boolean;
  /** One-based confirmed current step; absent for unknown or failed progress. */
  currentStep?: number;
  steps: { label: string; state: NetworkStepState }[];
}

/** Empty reads are not publication; a zero tally also needs completion evidence. */
export function hasPublishedTally(counts: readonly bigint[], completed: boolean): boolean {
  return counts.length > 0 && (counts.some((count) => count > 0n) || completed);
}

/** Phases describe confirmed milestones and what comes next, never off-chain job telemetry. */
export function e3Lifecycle({
  stage,
  inputStartMs,
  inputEndMs,
  nowMs = Date.now(),
  hasTally = false,
  failed = false,
}: {
  stage?: E3Stage;
  inputStartMs?: number;
  inputEndMs?: number;
  nowMs?: number;
  hasTally?: boolean;
  failed?: boolean;
}): E3Lifecycle {
  const published = hasTally || stage === E3Stage.Complete;
  const validWindow =
    inputStartMs !== undefined &&
    inputEndMs !== undefined &&
    Number.isFinite(inputStartMs) &&
    Number.isFinite(inputEndMs) &&
    inputEndMs > inputStartMs;
  let current = -1;
  let completedThrough = -1;
  let phase = "Status unavailable";
  let description = "The latest network stage is not available yet.";
  if (published) {
    completedThrough = 6;
    phase = "Published";
    description = "The aggregate result is published. Individual ballots remain private.";
  } else if (failed || stage === E3Stage.Failed) {
    phase = "Round failed";
    description = "This round cannot complete. The failure details are shown above.";
  } else if (stage === E3Stage.Requested) {
    completedThrough = 0;
    current = 1;
    phase = "Committee selection";
    description = "The request is confirmed. Waiting for the committee to be selected.";
  } else if (stage === E3Stage.CommitteeFinalized) {
    completedThrough = 1;
    current = 2;
    phase = "Key generation";
    description = "The committee is selected. Waiting for the shared encryption key.";
  } else if (stage === E3Stage.KeyPublished) {
    completedThrough = 2;
    if (validWindow && nowMs >= inputEndMs!) {
      completedThrough = 3;
      current = 4;
      phase = "Compute";
      description = "Awaiting the encrypted tally. Decryption and publication come next.";
    } else if (validWindow) {
      current = 3;
      phase = "Input window";
      description =
        nowMs < inputStartMs!
          ? "The encryption key is ready. The input window has not opened yet."
          : "The network input window is open. It can remain open after voting closes while submitted ballots are published.";
    } else {
      description = "The encryption key is published. The network input-window timing is unavailable.";
    }
  } else if (stage === E3Stage.CiphertextReady) {
    completedThrough = 4;
    current = 5;
    phase = "Decryption";
    description = "The encrypted tally is ready. Awaiting decryption and publication of the aggregate result.";
  }
  return {
    phase,
    description,
    published,
    currentStep: published ? E3_STEPS.length : current >= 0 ? current + 1 : undefined,
    steps: E3_STEPS.map((label, index) => ({
      label,
      state:
        index <= completedThrough ? "complete" : index === current ? "current" : current >= 0 ? "pending" : "unknown",
    })),
  };
}
