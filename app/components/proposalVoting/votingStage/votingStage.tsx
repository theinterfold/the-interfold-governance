import { BallotDisclosure } from "../ballotDisclosure";
import type { IBreakdownMajorityVotingResult, ProposalType } from "../votingBreakdown";
import { VotingBreakdown } from "../votingBreakdown";
import type { IBreakdownApprovalThresholdResult } from "../votingBreakdown/approvalThresholdResult";
import type { IVote, IVotingStageDetails } from "@/utils/types";

export interface IVotingStageProps<TType extends ProposalType = ProposalType> {
  title: string;
  number: number;
  disabled: boolean;
  status: string;
  variant: TType;
  proposalId?: string;
  result?: TType extends "approvalThreshold" ? IBreakdownApprovalThresholdResult : IBreakdownMajorityVotingResult;
  details?: IVotingStageDetails;
  votes?: IVote[];
}

/** Results are supporting information, never a gate to the ballot. */
export function VotingStage({ result, status, variant }: IVotingStageProps) {
  const active = status?.toLowerCase() === "active";
  return (
    <BallotDisclosure title={active ? "Live results" : "Results"}>
      <div className="public-ballot-results">{result && <VotingBreakdown variant={variant} result={result} />}</div>
    </BallotDisclosure>
  );
}
