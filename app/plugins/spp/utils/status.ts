import { SppProposalState } from "./types";

import type { SppProposal, SppStage } from "./types";

const VETO_STAGE_ID = 1;

/**
 * SPP-level status label once the proposal has left the voting stage (or ended).
 * Returns undefined while the proposal is still in stage 0 and not finalized —
 * the body-level (voting) status is the meaningful one there.
 */
export function getSppStatusOverride(
  proposal?: SppProposal,
  state?: SppProposalState,
  vetoTally?: { approvals: bigint; vetoes: bigint },
  vetoStage?: SppStage
): { label: string; className: string } | undefined {
  if (!proposal) return undefined;

  if (proposal.executed) return { label: "Executed", className: "executed" };
  if (proposal.canceled) return { label: "Canceled", className: "failed" };

  if (proposal.currentStage < VETO_STAGE_ID) {
    // Still in the voting stage; only surface a terminal state.
    if (state === SppProposalState.Expired) return { label: "Expired", className: "expired" };
    return undefined;
  }

  const vetoThreshold = BigInt(vetoStage?.vetoThreshold || 1);
  if ((vetoTally?.vetoes ?? 0n) >= vetoThreshold) return { label: "Vetoed", className: "failed" };

  if (state === SppProposalState.Advanceable) return { label: "Executable", className: "executable" };
  if (state === SppProposalState.Expired) return { label: "Expired", className: "expired" };

  return { label: "Veto period", className: "active" };
}
