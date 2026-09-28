import { BendingChevron } from "@/vendor/site-header";
import type { IBreakdownMajorityVotingResult, ProposalType } from "../votingBreakdown";
import { VotingBreakdown } from "../votingBreakdown";
import type { IBreakdownApprovalThresholdResult } from "../votingBreakdown/approvalThresholdResult";
import type { IVote, IVotingStageDetails } from "@/utils/types";
import { VotesDataList } from "../votesDataList/votesDataList";

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
export function VotingStage({ result, status, variant, votes }: IVotingStageProps) {
  const active = status?.toLowerCase() === "active";
  return (
    <details className="proposal-voting-details" open={!active || undefined}>
      <summary>
        <span>{active ? "Live results" : "Results"}</span>
        <BendingChevron />
      </summary>
      <div className="public-ballot-results">
        {result && <VotingBreakdown variant={variant} result={result} />}
        <details className="proposal-voting-details">
          <summary>
            <span>Votes</span>
            <BendingChevron />
          </summary>
          <VotesDataList votes={votes ?? []} />
        </details>
      </div>
    </details>
  );
}
