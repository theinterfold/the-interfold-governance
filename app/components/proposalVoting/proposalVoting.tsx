import { ActionButton } from "@/components/input/actionButton";
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { BallotChoices, BallotPanel, BallotReview, ballotOptionColor } from "./ballot";
import { VotingStage, type IVotingStageProps } from "./votingStage/votingStage";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import type { ITransformedStage } from "@/utils/types";
import { BallotSuccess } from "./ballotSuccess";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";

interface IProposalVotingProps {
  stage: ITransformedStage;
  proposalTitle: string;
  votingPower?: ReactNode;
  canVote: boolean;
  eligibilityNotice: ReactNode;
  submittedOption?: number;
  canChangeVote: boolean;
  confirmed: boolean;
  error?: string;
  txHash?: string;
}

export function ProposalVoting({
  stage,
  proposalTitle,
  votingPower,
  canVote,
  eligibilityNotice,
  submittedOption,
  canChangeVote,
  confirmed,
  error,
  txHash,
}: IProposalVotingProps) {
  const [option, setOption] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const submittedFocus = useRef<HTMLSpanElement>(null);
  const reviewAction = useRef<HTMLButtonElement>(null);
  const cta = stage?.result?.cta;
  const votingOpen = stage?.status?.toLowerCase() === "active";
  const votingPending = stage?.status?.toLowerCase() === "pending";
  const busy = !!cta?.isLoading;
  const selected = confirmed && option !== null ? option : submittedOption;
  const submitted = selected !== null && selected !== undefined && !editing;
  const ballotStep = submitted ? "submitted" : votingOpen ? (canVote ? "ballot" : "ineligible") : "closed";
  const powerVisible = !votingOpen || canVote || submitted;
  const wasPowerVisible = useRef(powerVisible);
  const [powerExitComplete, setPowerExitComplete] = useState(false);
  if (powerVisible) wasPowerVisible.current = true;
  const showPower = powerVisible || (wasPowerVisible.current && !powerExitComplete);
  const previousStep = useRef(ballotStep);
  const hasShownBallot = useRef(canVote);
  if (canVote) hasShownBallot.current = true;
  const options = ["Yes", "No", "Abstain"];

  useEffect(() => {
    if (confirmed) setEditing(false);
  }, [confirmed]);

  useEffect(() => {
    const previous = previousStep.current;
    previousStep.current = ballotStep;
    if (previous === "ballot" && ballotStep === "submitted") submittedFocus.current?.focus({ preventScroll: true });
    if (previous === "submitted" && ballotStep === "ballot") reviewAction.current?.focus({ preventScroll: true });
  }, [ballotStep]);

  useEffect(() => {
    if (powerVisible) {
      setPowerExitComplete(false);
      return;
    }
    if (!wasPowerVisible.current) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320;
    const timer = window.setTimeout(() => {
      wasPowerVisible.current = false;
      setPowerExitComplete(true);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [powerVisible]);

  if (!stage) return null;

  return (
    <BallotPanel
      title={submitted || (votingOpen && !canVote) ? "Voting" : votingOpen ? "Cast ballot" : "Voting results"}
      submitted={submitted}
    >
      <div className="vp-body">
        <FluidHeight layoutKey={`${ballotStep}:${showPower}:${!!error}`}>
          <div className="flex flex-col gap-5">
            {showPower && votingPower}
            {(submitted || (votingOpen && canVote)) && <p className="vp-note">Your vote is public.</p>}
            <div className="motion-tab-panels">
              <MotionPanel active={ballotStep === "submitted"} direction="right">
                <div className="flex flex-col gap-[14px]">
                  <span ref={submittedFocus} tabIndex={-1} className="sr-only">
                    Vote submitted successfully
                  </span>
                  <BallotSuccess txHash={txHash} />
                  {selected !== null && selected !== undefined && (
                    <div className="vp-confirmed-choice">
                      <span className="swatch" style={{ background: ballotOptionColor(selected) }} aria-hidden="true" />
                      <strong>{options[selected]}</strong>
                    </div>
                  )}
                  {votingOpen && canChangeVote && (
                    <ActionButton
                      onClick={() => {
                        setOption(selected ?? null);
                        setEditing(true);
                      }}
                    >
                      Change vote
                    </ActionButton>
                  )}
                </div>
              </MotionPanel>
              <MotionPanel active={ballotStep === "ineligible"} direction="left">
                {!submitted && eligibilityNotice}
              </MotionPanel>
              <MotionPanel active={ballotStep === "ballot"} direction="left">
                {hasShownBallot.current && (
                  <div className="flex flex-col gap-[14px]">
                    <BallotChoices
                      options={options}
                      presentation="framed"
                      maskUnavailable={true}
                      value={option}
                      onChange={(choice) => {
                        if (typeof choice === "number") setOption(choice);
                      }}
                      disabled={busy || !!cta?.disabled}
                    />
                    <div className="vp-cta">
                      <PowerAction
                        ref={reviewAction}
                        intent="vote"
                        className="w-full"
                        disabled={option === null || busy || !!cta?.disabled}
                        onClick={(event: MouseEvent<HTMLButtonElement>) => {
                          triggerRef.current = event.currentTarget;
                          setReviewOpen(true);
                        }}
                      >
                        {busy ? "Submitting vote…" : option === null ? "Choose your vote" : "Review vote"}
                      </PowerAction>
                    </div>
                  </div>
                )}
              </MotionPanel>
              <MotionPanel active={ballotStep === "closed"} direction="right">
                <div className="flex flex-col gap-[14px]">
                  <p className="vp-note">{votingPending ? "Voting has not started yet." : "Voting is closed."}</p>
                  {cta && (
                    <div className="vp-cta">
                      <ActionButton disabled={cta.disabled} isLoading={cta.isLoading} onClick={() => cta.onClick?.()}>
                        {cta.label}
                      </ActionButton>
                    </div>
                  )}
                </div>
              </MotionPanel>
            </div>
            {error && (
              <p className="vp-submission-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </FluidHeight>
      </div>
      <div className="proposal-ballot-context proposal-ballot-results-context">
        <VotingStage {...({ ...stage, number: 1 } as IVotingStageProps)} />
      </div>
      <BallotReview
        open={reviewOpen && canVote}
        pending={busy}
        triggerRef={triggerRef}
        returnFocusRef={submitted ? submittedFocus : undefined}
        onClose={() => setReviewOpen(false)}
        proposalTitle={proposalTitle}
        choice={option === null ? "" : options[option]}
        optionIndex={option ?? 0}
        votingPower={votingPower}
        footer={
          <PowerAction
            intent="vote"
            disabled={option === null || busy || !!cta?.disabled}
            onClick={() => {
              if (option === null || busy || cta?.disabled) return;
              setReviewOpen(false);
              setEditing(true);
              cta?.onClick?.(option + 1);
            }}
          >
            Submit vote
          </PowerAction>
        }
      >
        <p className="vp-note">Your wallet address and vote will be visible on-chain.</p>
        <div className="ballot-review-submission">
          <strong>1 transaction</strong>
          <p>Confirm in your wallet, where you can review the gas fee in ETH.</p>
        </div>
      </BallotReview>
    </BallotPanel>
  );
}
