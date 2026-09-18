import { useAccount, useBlockNumber, useReadContract } from "wagmi";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { iVotesAbi } from "../artifacts/iVotes";
import { useEffect } from "react";
import { PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { unixTimestampToDate } from "../utils/formatProposalDate";

import type { Address } from "viem";
import type { Proposal } from "../utils/types";

/**
 * Why a connected wallet cannot cast a ballot right now.
 *
 * `not-started` and `ended` are timing, not eligibility: the voter may be perfectly entitled to
 * vote and simply be early or late. Folding them into the same boolean as `no-voting-power`
 * produced the misleading "You cannot vote on this proposal" on a proposal whose window had not
 * opened yet.
 */
export type VoteBlockedReason =
  | "not-connected"
  | "not-started"
  | "ended"
  | "executed"
  | "no-voting-power"
  | "below-minimum";

export interface CanVoteResult {
  /** `undefined` while the on-chain reads are still in flight. */
  canVote: boolean | undefined;
  reason: VoteBlockedReason | undefined;
  /** Specific, human-readable explanation. `undefined` when the voter can vote. */
  message: string | undefined;
  /** True when the block is purely about timing, so callers can pick a softer presentation. */
  isTimingOnly: boolean;
}

/**
 * The CRISP plugin no longer exposes an on-chain `canVote` (ballots are cast
 * off-chain via the CRISP server) — mirror its eligibility rule client-side:
 * the proposal must be open and the voter's snapshot voting power must clear
 * `minVoterVotingPower`.
 *
 * Returns the REASON alongside the verdict. A bare boolean cannot distinguish "you hold no
 * voting power" from "voting opens in 25 minutes", and the UI has to say which.
 */
export function useCanVote(proposalId: bigint): CanVoteResult {
  const { address } = useAccount();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { data: proposalData } = useReadContract({
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "getProposal",
    args: [proposalId],
  });
  const proposal = proposalData as Proposal | undefined;

  const { data: votingToken } = useReadContract({
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "getVotingToken",
  });

  const { data: minVoterVotingPower } = useReadContract({
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "minVoterVotingPower",
  });

  const snapshotBlock = proposal?.parameters?.snapshotBlock;

  const { data: pastVotes, refetch: refreshPastVotes } = useReadContract({
    address: votingToken as Address | undefined,
    abi: iVotesAbi,
    functionName: "getPastVotes",
    args: [address!, snapshotBlock!],
    query: { enabled: !!address && !!votingToken && snapshotBlock !== undefined },
  });

  useEffect(() => {
    refreshPastVotes();
  }, [blockNumber, refreshPastVotes]);

  if (!address) {
    return {
      canVote: false,
      reason: "not-connected",
      message: "Connect a wallet to vote on this proposal.",
      isTimingOnly: false,
    };
  }

  // Still loading: report `undefined` so callers can stay quiet rather than flashing a wrong
  // explanation between renders.
  if (!proposal || pastVotes === undefined || minVoterVotingPower === undefined) {
    return { canVote: undefined, reason: undefined, message: undefined, isTimingOnly: false };
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const votes = pastVotes as bigint;
  const minimum = minVoterVotingPower as bigint;

  const blocked = (reason: VoteBlockedReason, message: string, isTimingOnly = false): CanVoteResult => ({
    canVote: false,
    reason,
    message,
    isTimingOnly,
  });

  if (proposal.executed) {
    return blocked("executed", "This proposal has already been executed.", true);
  }
  if (proposal.parameters.startDate > now) {
    return blocked(
      "not-started",
      `Voting has not opened yet. It starts on ${unixTimestampToDate(proposal.parameters.startDate)}.`,
      true
    );
  }
  if (now >= proposal.parameters.endDate) {
    return blocked("ended", `Voting closed on ${unixTimestampToDate(proposal.parameters.endDate)}.`, true);
  }

  // Eligibility is measured at the snapshot, not now, so a wallet funded or self-delegated after
  // the proposal was created still reads zero here. Say so explicitly — it is the single most
  // common cause of an unexpected block, and "you have no voting power" alone sends people to
  // check their current balance, which looks fine.
  if (votes === 0n) {
    return blocked(
      "no-voting-power",
      `You had no voting power at the snapshot (${unixTimestampToDate(proposal.parameters.snapshotBlock)}). ` +
        `Tokens acquired or self-delegated after that moment do not count for this proposal.`,
      false
    );
  }
  if (votes < minimum) {
    return blocked(
      "below-minimum",
      `Your voting power at the snapshot was below the minimum required to vote on this proposal.`,
      false
    );
  }

  return { canVote: true, reason: undefined, message: undefined, isTimingOnly: false };
}
