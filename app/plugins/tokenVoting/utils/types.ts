import type { Address } from "viem";
import type { IProposalResource, RawAction } from "@/utils/types";

/** Parts-per-million base used by Aragon OSx ratios (supportThreshold). */
export const RATIO_BASE = 1_000_000;

export type ProposalInputs = {
  proposalId: bigint;
};

export enum VotingMode {
  Standard,
  EarlyExecution,
  VoteReplacement,
}

/** IMajorityVoting.VoteOption */
export enum VoteOption {
  None,
  Abstain,
  Yes,
  No,
}

/** MajorityVotingBase.ProposalParameters (TokenVoting v1.4) */
export type ProposalParameters = {
  votingMode: VotingMode;
  supportThreshold: number;
  startDate: bigint;
  endDate: bigint;
  /** block.number-1 or block.timestamp-1 depending on the token's clock */
  snapshotTimepoint: bigint;
  /** absolute voting power required for participation (already ratio-applied on-chain) */
  minVotingPower: bigint;
};

/** MajorityVotingBase.Tally */
export type Tally = {
  abstain: bigint;
  yes: bigint;
  no: bigint;
};

export type Proposal = {
  active: boolean;
  executed: boolean;
  parameters: ProposalParameters;
  tally: Tally;
  actions: RawAction[];
  allowFailureMap: bigint;
  creator: string;
  title: string;
  summary: string;
  description: string;
  resources: IProposalResource[];
};

export type VoteCastEvent = {
  voter?: Address;
  proposalId?: bigint;
  voteOption?: number;
  votingPower?: bigint;
};
