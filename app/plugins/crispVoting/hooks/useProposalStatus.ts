import { useState, useEffect } from "react";
import { ProposalStatus } from "@aragon/ods";
import { useToken } from "./useToken";
import { usePastSupply } from "./usePastSupply";
import { computeQuorum, meetsSupportThreshold } from "../utils/quorum";

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
 * clear the proposal's FROZEN supportThreshold over yes + no (INV-33). The app is
 * fixed at 3 options, matching `NUM_OPTIONS`.
 */
function hasPassed(tally: bigint[], supportThreshold: bigint): boolean {
  const totalVotes = getTotalVotes(tally);
  if (totalVotes === 0n) return false;

  return meetsSupportThreshold(tally[0] ?? 0n, tally[1] ?? 0n, supportThreshold);
}

export const useProposalStatus = (proposal: Proposal, totalVotingPowerOverride?: bigint, e3Failed = false) => {
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
    // Frozen at creation (INV-33); default to the simple-majority 50 only if an old
    // proposal predates the field.
    const supportThreshold = proposal.parameters.supportThreshold ?? 50n;

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

    // Checked BEFORE `active`. `active` means only "the end date is in the future", and the
    // most common failures — committee formation timeout, DKG timeout — happen early, well
    // inside the voting window. Testing `active` first therefore advertised a dead round as
    // open for votes until its end date passed, with a vote card people could still click.
    // A failed round is terminal: it can never be tallied or executed.
    if (e3Failed) {
      setStatus(ProposalStatus.REJECTED);
    } else if (proposal?.active) {
      setStatus(ProposalStatus.ACTIVE);
    } else if (proposal?.executed) {
      setStatus(ProposalStatus.EXECUTED);
    } else if (!proposal?.isTallied) {
      setStatus(ProposalStatus.PENDING);
    } else if (totalVotes === 0n) {
      setStatus(ProposalStatus.REJECTED);
    } else if (quorum && !quorum.reached) {
      setStatus(ProposalStatus.REJECTED);
    } else if (hasPassed(tally, supportThreshold) && proposal.actions.length > 0) {
      setStatus(ProposalStatus.EXECUTABLE);
    } else if (hasPassed(tally, supportThreshold) && proposal.actions.length === 0) {
      setStatus(ProposalStatus.ACCEPTED);
    } else {
      // The tally is published and did not pass: below the frozen support threshold
      // (a tie at the 50 default included) is a rejection, matching `_canExecute`.
      setStatus(ProposalStatus.REJECTED);
    }
  }, [proposal, effectiveTotalSupply, decimals, e3Failed]);

  return status;
};
