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

type PrivateProposalStatus = {
  status: ProposalStatus;
  /** True only alongside REJECTED: turnout fell short of the proposal's frozen quorum rather than the vote going against it. */
  quorumNotMet: boolean;
};

/**
 * The body-level status of a CRISP proposal, mirroring `CrispVoting._canExecute`. A closed secret
 * vote remains undecided until its tally and quorum inputs are known.
 */
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
}): PrivateProposalStatus {
  const decided = (status: ProposalStatus, quorumNotMet = false): PrivateProposalStatus => ({ status, quorumNotMet });

  // A failed round is terminal and is checked before the voting window: the most common failures
  // (committee formation timeout, DKG timeout) happen early, inside the window, and the round can
  // never be tallied or executed.
  if (e3Failed) return decided(ProposalStatus.REJECTED);
  if (!proposal?.parameters) return decided(ProposalStatus.PENDING);
  if (proposal.executed) return decided(ProposalStatus.EXECUTED);

  const startMs = Number(proposal.parameters.startDate) * 1000;
  const endMs = Number(proposal.parameters.endDate) * 1000;
  if (nowMs < startMs) return decided(ProposalStatus.PENDING);
  if (nowMs < endMs) return decided(ProposalStatus.ACTIVE);
  if (!proposal.isTallied || decimals === undefined) return decided(ProposalStatus.PENDING);

  const tally = proposal.tally ?? [];
  const totalVotes = getTotalVotes(tally);

  const quorum = computeQuorum(
    totalVotes,
    totalVotingPower ?? 0n,
    Number(proposal.parameters.minParticipation ?? 0n),
    proposal.parameters.creditMode,
    Number(decimals)
  );
  if (Number(proposal.parameters.minParticipation ?? 0n) > 0 && quorum === null) return decided(ProposalStatus.PENDING);
  // An empty tally lands here whenever a quorum is required. Without one (minParticipation 0)
  // it fails support below instead: `hasPassed` is false on zero votes.
  if (quorum && !quorum.reached) return decided(ProposalStatus.REJECTED, true);

  const supportThreshold = proposal.parameters.supportThreshold ?? 50n;
  // The tally is published and did not pass: below the frozen support threshold (a tie at the 50
  // default included) is a rejection, matching `_canExecute`.
  if (!hasPassed(tally, supportThreshold)) return decided(ProposalStatus.REJECTED);
  return decided(proposal.actions.length > 0 ? ProposalStatus.EXECUTABLE : ProposalStatus.ACCEPTED);
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
