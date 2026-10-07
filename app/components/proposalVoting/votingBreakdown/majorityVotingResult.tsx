import { ResultRows } from "../resultPanel";
import { type VotingCta } from "./types";

export interface IBreakdownMajorityVotingResult {
  votingScores: { option: string; voteAmount: string; votePercentage: number; tokenSymbol: string }[];
  cta?: VotingCta;
}

export function BreakdownMajorityVotingResult({ votingScores }: IBreakdownMajorityVotingResult) {
  return (
    <ResultRows
      rows={votingScores.map((choice, index) => ({
        option: choice.option,
        index,
        percentage: choice.votePercentage,
        amount: `${choice.voteAmount} ${choice.tokenSymbol}`,
      }))}
    />
  );
}
