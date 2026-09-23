import { Button } from "@aragon/ods";
import { unixTimestampToDate } from "../../utils/formatProposalDate";
import type { VotingStep } from "../../utils/types";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { useState } from "react";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { useInert } from "@/components/motion/useInert";
import VotingStepIndicator from "./voteProgress";

export interface VoteCardProps {
  error?: string;
  options: string[];
  voteStartDate: number;
  voteEndDate: number;
  disabled: boolean;
  isLoading: boolean;
  proposalId: bigint;
  votingStep: VotingStep;
  lastActiveStep: VotingStep | null;
  stepMessage: string;
  isCommitteeReady: boolean;
  txHash: string | null;
  onClickVote: (voteOption: number) => void;
  /** The round accepts a direct on-chain vote right now. */
  canPublishOnChain?: boolean;
  /** Why the on-chain route is unavailable, when it is. */
  onChainBlockedReason?: string;
  /** Submit the ballot yourself rather than via the CRISP server. */
  submitOnChain?: boolean;
  onChangeSubmitOnChain?: (value: boolean) => void;
  onClickMask: () => void;
}

// Interfold earth-tone palette — readable on the cream canvas
const OPTION_COLORS = ["#2f8a4f", "#a84932", "#7a7d77", "#355a8a", "#8a6a40", "#5a4a8a", "#2f7a6a", "#9a7a30"];

function getColor(index: number): string {
  return OPTION_COLORS[index % OPTION_COLORS.length];
}

export const VoteCard = ({
  error,
  options,
  voteStartDate,
  disabled,
  isLoading,
  onClickVote,
  canPublishOnChain,
  onChainBlockedReason,
  submitOnChain = false,
  onChangeSubmitOnChain,
  onClickMask,
  votingStep,
  lastActiveStep,
  stepMessage,
  isCommitteeReady,
  txHash,
}: VoteCardProps) => {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [mode, setMode] = useState<"vote" | "mask">("vote");
  const [submittedMode, setSubmittedMode] = useState<"vote" | "mask" | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const isMasking = mode === "mask";
  const ballotRef = useInert(isMasking);
  const maskRef = useInert(!isMasking);
  const feedbackVisible =
    showFeedback && (isLoading || !!txHash || votingStep === "error" || votingStep === "complete");
  const feedbackRef = useInert(!feedbackVisible);

  const handleVote = () => {
    if (selectedOption === null) return;
    setSubmittedMode("vote");
    setShowFeedback(true);
    onClickVote(selectedOption);
  };

  const handleMask = () => {
    setSubmittedMode("mask");
    setShowFeedback(true);
    onClickMask();
  };

  const changeMode = () => {
    setMode(isMasking ? "vote" : "mask");
    setShowFeedback(false);
  };

  const isDisabled = disabled || isLoading;
  const notStarted = voteStartDate > Math.round(Date.now() / 1000);
  const started = voteStartDate < Math.round(Date.now() / 1000);

  return (
    <div className="vote-panel" data-vote-mode={mode}>
      <div className="vp-head">
        <h3 aria-live="polite">
          <span key={mode} className="vp-label-change">
            {isMasking ? "Mask ballot" : "Cast ballot"}
          </span>
        </h3>
      </div>

      <div className="vp-body">
        {error && <p className="text-sm text-critical-500">{error}</p>}

        {notStarted && (
          <p className="vp-foot-note" style={{ textAlign: "left" }}>
            The vote will start on {unixTimestampToDate(voteStartDate)}
          </p>
        )}

        {started && !isCommitteeReady && (
          <div className="border px-4 py-3" style={{ borderColor: "var(--rule)", background: "var(--mint-pale)" }}>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              The ciphernode committee is being formed. Voting will be available once the committee is ready.
            </p>
          </div>
        )}

        <FluidHeight>
          <div className="vp-mode-views">
            <div
              className="vp-mode-view vp-ballot-view"
              data-active={!isMasking}
              aria-hidden={isMasking}
              ref={ballotRef}
            >
              <p className="vp-note">
                Cast your encrypted ballot. You can change your vote at any time before voting closes. Results are
                tallied after the voting period ends.
              </p>
              <div className="vote-choices">
                {options.map((option, index) => {
                  const isSelected = selectedOption === index;
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={isDisabled}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedOption(index)}
                      className={`vote-choice ${isSelected ? "selected" : ""}`}
                    >
                      <span className="label">
                        <span className="swatch" style={{ background: getColor(index) }} />
                        <span className="truncate">{option}</span>
                      </span>
                      <span className="mark">{isSelected ? "●" : "○"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="vp-mode-view vp-mask-view" data-active={isMasking} aria-hidden={!isMasking} ref={maskRef}>
              <p className="vp-note">Add cover for other voters with an encrypted, zero-weight ballot.</p>
              <div className="vp-mask-explanation">
                <span className="vp-mask-symbol" aria-hidden="true">
                  ○
                </span>
                <div>
                  <p>A mask adds no voting weight.</p>
                  <p>It does not select Yes, No or Abstain, and does not replace a vote you have already cast.</p>
                </div>
              </div>
            </div>
          </div>
        </FluidHeight>

        {/* Submission route. The ballot is encrypted and proven locally either way — this only
            decides who sends the transaction, the voter or the CRISP server acting as relayer. */}
        {!onChangeSubmitOnChain && submitOnChain && (
          <p className="pt-2 text-xs text-neutral-500">
            Your ballot is encrypted locally and submitted on-chain by your wallet (you pay gas).
            {canPublishOnChain === false && onChainBlockedReason ? ` ${onChainBlockedReason}` : ""}
          </p>
        )}
        {onChangeSubmitOnChain && (
          <div className="flex flex-col gap-y-1 pt-2">
            <label className="flex items-center gap-x-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={submitOnChain}
                disabled={isDisabled || !canPublishOnChain}
                onChange={(e) => onChangeSubmitOnChain(e.target.checked)}
              />
              Submit on-chain myself (you pay gas)
            </label>
            <p className="text-xs text-neutral-500">
              {canPublishOnChain === false && onChainBlockedReason
                ? onChainBlockedReason
                : "Bypasses the CRISP server. Your ballot stays encrypted either way; this only changes who sends the transaction."}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="vp-cta">
          <Button
            className="w-full"
            size="lg"
            variant="primary"
            disabled={isDisabled || (!isMasking && selectedOption === null)}
            onClick={isMasking ? handleMask : handleVote}
          >
            <span className="vp-label-change" key={isLoading ? "loading" : `${mode}-${selectedOption}`}>
              {isLoading ? (
                <PleaseWaitSpinner fullMessage={submittedMode === "mask" ? "Preparing mask…" : "Encrypting ballot…"} />
              ) : isMasking ? (
                "Submit mask ballot"
              ) : selectedOption !== null ? (
                `Submit encrypted ballot · ${options[selectedOption]}`
              ) : (
                "Select an option"
              )}
            </span>
          </Button>

          <button type="button" disabled={isDisabled} onClick={changeMode} className="vp-foot-note vp-mode-toggle">
            <span className="vp-mode-icon" aria-hidden="true">
              <svg
                className="vp-eye-icon"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <svg
                className="vp-back-icon"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m12 5-7 7 7 7M5 12h14" />
              </svg>
            </span>
            <span key={mode} className="vp-label-change">
              {isMasking ? "Back to ballot" : "Mask vote instead"}
            </span>
          </button>
        </div>

        {/* Feedback grows below the controls, keeping the option and action in place. */}
        <div
          className="proposal-disclosure vp-feedback"
          data-open={feedbackVisible}
          aria-hidden={!feedbackVisible}
          ref={feedbackRef}
        >
          <div className="proposal-disclosure-clip">
            {submittedMode && (
              <FluidHeight>
                <VotingStepIndicator
                  step={votingStep}
                  lastActiveStep={lastActiveStep}
                  message={stepMessage}
                  txHash={txHash}
                />
              </FluidHeight>
            )}
          </div>
        </div>
      </div>

      <div className="privacy">
        <span className="dot" />
        <div>
          Ballots are encrypted client-side and tallied under encryption within an Encrypted Execution Environment (E3).
          Individual votes are <em>never</em> revealed.
        </div>
      </div>
    </div>
  );
};
