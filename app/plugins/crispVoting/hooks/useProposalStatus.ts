import { useState, useEffect } from "react";
import { ProposalStatus } from "@aragon/ods";
import { useToken } from "./useToken";
import { usePastSupply } from "./usePastSupply";
import { computeQuorum } from "../utils/quorum";

import type { Proposal } from "../utils/types";

/** Sum all counts in the tally array. */
function getTotalVotes(tally: bigint[]): bigint {
  let sum = 0n;

  for (let i = 0; i < tally.length; i += 1) {
    sum += tally[i] ?? 0n;
  }

  return sum;
}

/**
 * Mirrors the contract's `_canExecute`: quorum, then yes (index 0) must strictly
 * beat no (index 1). The app is fixed at 3 options, matching `NUM_OPTIONS`.
 */
function hasPassed(tally: bigint[]): boolean {
  const totalVotes = getTotalVotes(tally);
  if (totalVotes === 0n) return false;

  return (tally[0] ?? BigInt(0)) > (tally[1] ?? BigInt(0));
}

/** Rejected when no (index 1) is at least yes (index 0) — a tie is a rejection. */
function isRejected(tally: bigint[]): boolean {
  return (tally[1] ?? BigInt(0)) >= (tally[0] ?? BigInt(0));
}

export const useProposalStatus = (proposal: Proposal, totalVotingPowerOverride?: bigint) => {
  const [status, setStatus] = useState<ProposalStatus>(ProposalStatus.PENDING);

  const { decimals } = useToken();
  // Quorum uses the total voting power at the snapshot timepoint, mirroring the
  // contract's `totalVotingPower(snapshotBlock)` (= getPastTotalSupply).
  const pastSupply = usePastSupply(proposal?.parameters?.snapshotBlock);
  const effectiveTotalSupply = totalVotingPowerOverride ?? pastSupply;

  useEffect(() => {
    if (!proposal || !proposal?.parameters) return;
    // Quorum scales by the token's decimals; wait for the real value rather than
    // settling a pass/fail verdict against an assumed 18.
    if (decimals === undefined) return;

    const tally = proposal.tally ?? [];
    const totalVotes = getTotalVotes(tally);

    // Quorum applies to EVERY proposal, with or without actions — `CrispVoting._canExecute`
    // gates on it unconditionally. Skipping it for "signaling" proposals would make the app
    // report a pass the chain rejects.
    const quorum = computeQuorum(
      totalVotes,
      effectiveTotalSupply,
      Number(proposal.parameters.minParticipation ?? 0n),
      proposal.parameters.creditMode,
      Number(decimals)
    );

    if (proposal?.active) {
      setStatus(ProposalStatus.ACTIVE);
    } else if (proposal?.executed) {
      setStatus(ProposalStatus.EXECUTED);
    } else if (!proposal?.isTallied) {
      setStatus(ProposalStatus.PENDING);
    } else if (totalVotes === 0n) {
      setStatus(ProposalStatus.REJECTED);
    } else if (quorum && !quorum.reached) {
      setStatus(ProposalStatus.REJECTED);
    } else if (hasPassed(tally) && proposal.actions.length > 0) {
      setStatus(ProposalStatus.EXECUTABLE);
    } else if (hasPassed(tally) && proposal.actions.length === 0) {
      setStatus(ProposalStatus.ACCEPTED);
    } else if (isRejected(tally)) {
      setStatus(ProposalStatus.REJECTED);
    } else {
      setStatus(ProposalStatus.PENDING);
    }
  }, [proposal, effectiveTotalSupply, decimals]);

  return status;
};
