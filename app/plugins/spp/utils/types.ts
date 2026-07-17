import { PUB_SPP_PRIVATE_ADDRESS, PUB_SPP_PUBLIC_ADDRESS } from "@/constants";

import type { Address } from "viem";
import type { RawAction } from "@/utils/types";

/** Which SPP instance a proposal lives on. */
export type SppKind = "private" | "public";

export function sppAddressFor(kind: SppKind): Address {
  return kind === "private" ? PUB_SPP_PRIVATE_ADDRESS : PUB_SPP_PUBLIC_ADDRESS;
}

/** SPP body proposal id sentinel — sub-proposal creation on the body failed. */
export const SPP_PROPOSAL_WITHOUT_ID = BigInt("0x" + "ff".repeat(32));

/** StagedProposalProcessor.ResultType */
export enum SppResultType {
  None,
  Approval,
  Veto,
}

/** StagedProposalProcessor.ProposalState */
export enum SppProposalState {
  Active,
  Canceled,
  Executed,
  Advanceable,
  Expired,
}

/** StagedProposalProcessor.Body */
export type SppBody = {
  addr: Address;
  isManual: boolean;
  tryAdvance: boolean;
  resultType: SppResultType;
};

/** StagedProposalProcessor.Stage */
export type SppStage = {
  bodies: readonly SppBody[];
  maxAdvance: bigint;
  minAdvance: bigint;
  voteDuration: bigint;
  approvalThreshold: number;
  vetoThreshold: number;
  cancelable: boolean;
  editable: boolean;
};

/** StagedProposalProcessor.Proposal */
export type SppProposal = {
  allowFailureMap: bigint;
  lastStageTransition: bigint;
  currentStage: number;
  stageConfigIndex: number;
  executed: boolean;
  canceled: boolean;
  creator: Address;
  actions: readonly RawAction[];
  targetConfig: { target: Address; operation: number };
};
