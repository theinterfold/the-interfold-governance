import { Button } from "@aragon/ods";
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { BallotChoices, BallotPanel, BallotReview, ballotOptionColor } from "./ballot";
import { VotingStage, type IVotingStageProps } from "./votingStage/votingStage";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import type { ITransformedStage } from "@/utils/types";
import { BallotSuccess } from "./ballotSuccess";

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
  const cta = stage?.result?.cta;
  const votingOpen = stage?.status?.toLowerCase() === "active";
  const votingPending = stage?.status?.toLowerCase() === "pending";
  const busy = !!cta?.isLoading;
  const selected = confirmed && option !== null ? option : submittedOption;
  const submitted = selected !== null && selected !== undefined && !editing;
  const options = ["Yes", "No", "Abstain"];

  useEffect(() => {
    if (confirmed) setEditing(false);
  }, [confirmed]);

  if (!stage) return null;

  return (
    <BallotPanel
      title={submitted || (votingOpen && !canVote) ? "Voting" : votingOpen ? "Cast ballot" : "Voting results"}
      submitted={submitted}
    >
      <div className="vp-body">
        {submitted && <BallotSuccess txHash={txHash} />}
        {(!votingOpen || canVote || submitted) && votingPower}
        {(submitted || (votingOpen && canVote)) && <p className="vp-note">Your vote is public.</p>}
        {submitted ? (
          <>
            <div className="vp-confirmed-choice">
              <span className="swatch" style={{ background: ballotOptionColor(selected) }} aria-hidden="true" />
              <strong>{options[selected]}</strong>
            </div>
            {votingOpen && canChangeVote && (
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  setOption(selected);
                  setEditing(true);
                }}
              >
                Change vote
              </Button>
            )}
          </>
        ) : votingOpen && !canVote ? (
          eligibilityNotice
        ) : votingOpen ? (
          <>
            <BallotChoices
              options={options}
              value={option}
              onChange={(choice) => {
                if (typeof choice === "number") setOption(choice);
              }}
              disabled={busy || !!cta?.disabled}
              maskUnavailableReason="Only available for secret ballots"
            />
            <div className="vp-cta">
              <PowerAction
                intent="vote"
                className="w-full"
                disabled={option === null || busy || !!cta?.disabled}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  triggerRef.current = event.currentTarget;
                  setReviewOpen(true);
                }}
              >
                {busy ? "Submitting vote…" : option === null ? "Select an option" : `Submit vote · ${options[option]}`}
              </PowerAction>
            </div>
          </>
        ) : (
          <p className="vp-note">{votingPending ? "Voting has not started yet." : "Voting is closed."}</p>
        )}
        {!votingOpen && cta && (
          <div className="vp-cta">
            <Button size="lg" disabled={cta.disabled} isLoading={cta.isLoading} onClick={() => cta.onClick?.()}>
              {cta.label}
            </Button>
          </div>
        )}
        {error && (
          <p className="vp-submission-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="proposal-ballot-context">
        <VotingStage {...({ ...stage, number: 1 } as IVotingStageProps)} />
      </div>
      <BallotReview
        open={reviewOpen && canVote}
        pending={busy}
        triggerRef={triggerRef}
        onClose={() => setReviewOpen(false)}
        proposalTitle={proposalTitle}
        choice={option === null ? "" : options[option]}
        optionIndex={option ?? 0}
        votingPower={votingPower}
      >
        <p className="vp-note">Your wallet address and vote will be visible on-chain.</p>
        <div className="ballot-review-submission">
          <strong>1 transaction</strong>
          <p>Confirm in your wallet, where you can review the gas fee in ETH.</p>
        </div>
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
      </BallotReview>
    </BallotPanel>
  );
}
