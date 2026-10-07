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

/** A closed secret vote remains undecided until its tally and quorum inputs are known. */
export function derivePrivateProposalStatus({
  proposal,
  totalVotingPower,
  decimals,
  e3Failed = false,
  nowMs,
}: {
  proposal?: Proposal | null;
  totalVotingPower?: bigint;
  decimals?: bigint | number;
  e3Failed?: boolean;
  nowMs: number;
}): ProposalStatus {
  if (e3Failed) return ProposalStatus.REJECTED;
  if (!proposal?.parameters) return ProposalStatus.PENDING;
  if (proposal.executed) return ProposalStatus.EXECUTED;

  const startMs = Number(proposal.parameters.startDate) * 1000;
  const endMs = Number(proposal.parameters.endDate) * 1000;
  if (nowMs < startMs) return ProposalStatus.PENDING;
  if (nowMs < endMs) return ProposalStatus.ACTIVE;
  if (!proposal.isTallied || decimals === undefined) return ProposalStatus.PENDING;

  const tally = proposal.tally ?? [];
  const totalVotes = getTotalVotes(tally);
  if (totalVotes === 0n) return ProposalStatus.REJECTED;

  const quorum = computeQuorum(
    totalVotes,
    totalVotingPower ?? 0n,
    Number(proposal.parameters.minParticipation ?? 0n),
    proposal.parameters.creditMode,
    Number(decimals)
  );
  if (Number(proposal.parameters.minParticipation ?? 0n) > 0 && quorum === null) return ProposalStatus.PENDING;
  if (quorum && !quorum.reached) return ProposalStatus.REJECTED;

  const supportThreshold = proposal.parameters.supportThreshold ?? 50n;
  if (!hasPassed(tally, supportThreshold)) return ProposalStatus.REJECTED;
  return proposal.actions.length > 0 ? ProposalStatus.EXECUTABLE : ProposalStatus.ACCEPTED;
}

export const useProposalStatus = (
  proposal: Proposal,
  totalVotingPowerOverride?: bigint,
  e3Failed = false,
  nowMs = Date.now()
) => {
  const { decimals } = useToken();
  const pastSupply = usePastSupply(proposal?.parameters?.snapshotBlock);
  return derivePrivateProposalStatus({
    proposal,
    totalVotingPower: totalVotingPowerOverride ?? pastSupply,
    decimals,
    e3Failed,
    nowMs,
  });
};
