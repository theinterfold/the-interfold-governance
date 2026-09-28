import { Progress } from "@aragon/ods";
import classNames from "classnames";
import { type VotingCta } from "./types";

type Choice = "yes" | "no" | "abstain";

export interface IBreakdownMajorityVotingResult {
  votingScores: { option: string; voteAmount: string; votePercentage: number; tokenSymbol: string }[];
  cta?: VotingCta;
}

const choiceClassNames: Record<Choice, string> = {
  yes: "*:bg-success-500",
  abstain: "*:bg-neutral-400",
  no: "*:bg-critical-500",
};

const choiceTextClassNames: Record<Choice, string> = {
  yes: "text-success-800",
  abstain: "text-neutral-800",
  no: "text-critical-800",
};

export const BreakdownMajorityVotingResult: React.FC<IBreakdownMajorityVotingResult> = (props) => {
  const { votingScores } = props;

  return (
    <div className="public-vote-breakdown flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-3 rounded-xl border border-neutral-100 p-3 shadow-neutral-sm md:flex-row md:gap-x-6 md:p-6">
        {votingScores.map((choice, index) => (
          <div className="flex flex-1 flex-col gap-y-3 md:flex-row md:gap-x-6" key={choice.option}>
            <div className="flex flex-1 flex-col gap-y-2 py-1 md:gap-y-3 md:py-0">
              <span
                className={classNames(
                  "capitalize leading-tight md:text-lg",
                  choiceTextClassNames[choice.option as Choice]
                )}
              >
                {choice.option}
              </span>
              <Progress value={choice.votePercentage} className={choiceClassNames[choice.option as Choice]} />
              <div className="flex gap-x-1">
                <span className="text-neutral-800">{choice.voteAmount}</span>
                <span className="text-neutral-500">{choice.tokenSymbol}</span>
              </div>
            </div>
            {index < votingScores.length - 1 && <div className="h-0.25 bg-neutral-100 md:h-auto md:w-0.25" />}
          </div>
        ))}
      </div>
    </div>
  );
};
