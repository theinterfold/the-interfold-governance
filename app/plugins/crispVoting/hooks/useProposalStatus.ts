import { useState, useEffect } from "react";
import { ProposalStatus } from "@aragon/ods";
import { useToken } from "./useToken";

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
 * Mirrors the contract's _canExecute logic:
 * - 2-3 options: quorum + counts[0] > counts[1]
 * - 4+ options: quorum only
 */
function hasPassed(tally: bigint[], numOptions: number): boolean {
  const totalVotes = getTotalVotes(tally);
  if (totalVotes === 0n) return false;

  if (numOptions <= 3) {
    return (tally[0] ?? BigInt(0)) > (tally[1] ?? BigInt(0));
  }
  return true;
}

/**
 * For 2-3 options, the proposal is rejected when no >= yes.
 * For 4+ options, there's no concept of "rejected" — it either
 * meets quorum or has low turnout.
 */
function isRejected(tally: bigint[], numOptions: number): boolean {
  if (numOptions <= 3) {
    return (tally[1] ?? BigInt(0)) >= (tally[0] ?? BigInt(0));
  }
  return false;
}

export const useProposalStatus = (proposal: Proposal, totalVotingPowerOverride?: bigint) => {
  const [status, setStatus] = useState<ProposalStatus>(ProposalStatus.PENDING);

  const { tokenSupply: totalSupply } = useToken();

  const effectiveTotalSupply = totalVotingPowerOverride ?? totalSupply;

  useEffect(() => {
    if (!proposal || !proposal?.parameters || !effectiveTotalSupply) return;

    const tally = proposal.tally ?? [];
    const numOptions = proposal.numOptions ?? tally.length;
    const totalVotes = getTotalVotes(tally);
    const minVotingPower = (effectiveTotalSupply * BigInt(proposal.parameters.minVotingPower)) / BigInt(100);

    if (proposal?.active) {
      setStatus(ProposalStatus.ACTIVE);
    } else if (proposal?.executed) {
      setStatus(ProposalStatus.EXECUTED);
    } else if (!proposal?.isTallied) {
      setStatus(ProposalStatus.PENDING);
    } else if (totalVotes === 0n) {
      setStatus(ProposalStatus.FAILED);
    } else if (totalVotes < minVotingPower) {
      setStatus(ProposalStatus.FAILED);
    } else if (hasPassed(tally, numOptions) && proposal.actions.length > 0) {
      setStatus(ProposalStatus.EXECUTABLE);
    } else if (hasPassed(tally, numOptions) && proposal.actions.length === 0) {
      setStatus(ProposalStatus.ACCEPTED);
    } else if (isRejected(tally, numOptions)) {
      setStatus(ProposalStatus.REJECTED);
    } else {
      setStatus(ProposalStatus.PENDING);
    }
  }, [proposal, effectiveTotalSupply]);

  return status;
};
