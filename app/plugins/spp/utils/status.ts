import { SppProposalState } from "./types";

import type { SppProposal, SppStage } from "./types";

const VETO_STAGE_ID = 1;

/**
 * SPP-level status label once the proposal has left the voting stage (or ended).
 * Returns undefined while the proposal is still in stage 0 and not finalized —
 * the body-level (voting) status is the meaningful one there.
 *
 * Note this keys on `proposal.actions` (the SPP's own actions, which are what
 * execute on the DAO). That is the ONLY definition of "signaling" in this app —
 * a proposal with nothing to execute. Quorum still applies to it on-chain.
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

  // Stage-1 mode, read from the stage config the proposal was created under:
  // approval (opt-in, vetoThreshold == 0) vs veto (opt-out). Mirrors VetoStageCard.
  const approvalMode = (vetoStage?.vetoThreshold ?? 1) === 0;

  // A veto is only reachable in veto mode; in approval mode silence is the rejection.
  if (!approvalMode) {
    const vetoThreshold = BigInt(vetoStage?.vetoThreshold || 1);
    if ((vetoTally?.vetoes ?? 0n) >= vetoThreshold) return { label: "Vetoed", className: "failed" };
  }

  // Signaling proposals carry no actions: the final advance is a no-op that only
  // marks them executed, so "Executable" overstates what is left to do.
  // `=== 0` rather than a falsy check: if actions were ever undefined we want the
  // existing "Executable" wording, not a wrong "Accepted".
  const signaling = proposal.actions?.length === 0;
  const accepted = { label: "Accepted", className: "accepted" };

  if (state === SppProposalState.Advanceable) {
    return signaling ? accepted : { label: "Executable", className: "executable" };
  }

  if (state === SppProposalState.Expired) {
    // Reaching stage 1 means stage 0 succeeded, so in veto mode (silence = consent)
    // a lapsed window costs a signaling proposal nothing — it still passed. In
    // approval mode the lapse IS the rejection: the foundation never approved.
    if (signaling && !approvalMode) return accepted;
    return { label: "Expired", className: "expired" };
  }

  return { label: approvalMode ? "Approval period" : "Veto period", className: "active" };
}
