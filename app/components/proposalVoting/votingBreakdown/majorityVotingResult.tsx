import { capitalizeFirstLetter } from "@/utils/text";
import { Button, Heading, Progress, RadioCard, RadioGroup } from "@aragon/ods";
import classNames from "classnames";
import { useEffect, useId, useRef, useState } from "react";
import { type VotingCta } from "./types";
import { Disclosure } from "@/components/motion/Disclosure";

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
  const { cta, votingScores } = props;

  const [showOptions, setShowOptions] = useState(false);
  const [option, setOption] = useState<string>();
  const optionsId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);

  const closeOptions = () => {
    setShowOptions(false);
    actionsRef.current?.querySelector("button")?.focus({ preventScroll: true });
  };

  const handleVoteClick = () => {
    if (showOptions || votingScores.length === 1) {
      cta?.onClick?.(parseInt(option ?? "0"));
    } else {
      setShowOptions(true);
    }
  };

  useEffect(() => {
    if (!!cta?.disabled && !!option) {
      setShowOptions(false);
    }
  }, [cta?.disabled, option]);

  const label = showOptions && !cta?.isLoading ? "Submit vote" : cta?.label;
  const disabled = (!!showOptions && !option) || cta?.disabled;

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
      {/* Options */}
      <Disclosure open={showOptions} id={optionsId} className="public-vote-options">
        <div className="flex flex-col gap-y-3 pt-3">
          <div className="flex flex-col gap-y-2">
            <Heading size="h3">Choose your option</Heading>
            <p className="text-neutral-500">Choose an option, then confirm in your wallet.</p>
          </div>
          <RadioGroup value={option} onValueChange={(value) => setOption(value)} className="!gap-y-3">
            {votingScores?.map((choice, index) => {
              const parsedChoice = capitalizeFirstLetter(choice.option);
              return (
                <RadioCard
                  key={choice.option}
                  label={parsedChoice}
                  description=""
                  className="public-vote-choice"
                  value={(index + 1).toString()}
                />
              );
            })}
          </RadioGroup>
        </div>
      </Disclosure>
      {/* Button group */}
      {cta && (
        <div ref={actionsRef} className="flex w-full flex-col gap-y-4 md:flex-row md:gap-x-4">
          <Button
            size="md"
            disabled={disabled}
            onClick={handleVoteClick}
            isLoading={cta.isLoading}
            aria-expanded={showOptions}
            aria-controls={optionsId}
          >
            <span key={label} className="vp-label-change">
              {label}
            </span>
          </Button>

          <Disclosure open={showOptions} className="public-vote-cancel">
            <Button size="md" onClick={closeOptions} variant="tertiary" className="w-full">
              Cancel
            </Button>
          </Disclosure>
        </div>
      )}
    </div>
  );
};
