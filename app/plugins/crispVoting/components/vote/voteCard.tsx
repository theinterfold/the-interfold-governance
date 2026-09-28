import { NativeSelect } from "@/components/input/nativeSelect";
import { AddressText } from "@/components/text/address";
import { Button } from "@aragon/ods";
import { unixTimestampToDate } from "../../utils/formatProposalDate";
import type { VotingStep } from "../../utils/types";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { useEffect, useId, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { PUB_CHAIN } from "@/constants";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { useInert } from "@/components/motion/useInert";
import VotingStepIndicator from "./voteProgress";
import {
  BallotPanel,
  BallotSubmissionInfo,
  BallotChoices,
  BallotReview,
  MaskIcon,
  ballotOptionColor as getColor,
} from "@/components/proposalVoting/ballot";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { isAddress } from "viem";
import { submitBallotSequence, type BallotKind, type BallotSubmissionResult } from "../../utils/ballotSubmission";

export interface VoteCardProps {
  votingPower?: ReactNode;
  eligibilityNotice?: ReactNode;
  canMask?: boolean;
  proposalTitle?: string;
  getRandomMaskTarget: () => Promise<string>;
  maskAsOption?: boolean;
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
  walletAddress?: string;
  voteDisabled?: boolean;
  onClickVote: (voteOption: number) => Promise<BallotSubmissionResult>;
  /** The round accepts a direct on-chain vote right now. */
  canPublishOnChain?: boolean;
  /** Why the on-chain route is unavailable, when it is. */
  onChainBlockedReason?: string;
  /** Submit the ballot yourself rather than via the CRISP server. */
  submitOnChain?: boolean;
  onChangeSubmitOnChain?: (value: boolean) => void;
  onClickMask: (target?: string) => Promise<BallotSubmissionResult>;
}

export const VoteCard = ({
  votingPower,
  eligibilityNotice,
  canMask = true,
  proposalTitle,
  getRandomMaskTarget,
  maskAsOption = true,
  error,
  options,
  voteStartDate,
  voteEndDate,
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
  walletAddress,
  voteDisabled = false,
}: VoteCardProps) => {
  // One selection: a vote and a standalone mask can never both be selected.
  const [selectedChoice, setSelectedChoice] = useState<number | "mask" | null>(null);
  const selectedOption = typeof selectedChoice === "number" ? selectedChoice : null;
  const selectedMask = maskAsOption && selectedChoice === "mask";
  const [mode, setMode] = useState<"vote" | "mask">("vote");
  const [submittedMode, setSubmittedMode] = useState<BallotKind | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  // Immediate feedback only: no vote choices, mask counters or history are persisted.
  const [receipts, setReceipts] = useState<
    Partial<Record<BallotKind, { txHash: string | null; option: number | null }>>
  >({});
  const [editingMode, setEditingMode] = useState<BallotKind | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<BallotKind>("vote");
  const [includeMask, setIncludeMask] = useState(false);
  const maskOptionId = useId();
  const [targetMode, setTargetMode] = useState<"random" | "self" | "address">("random");
  const [targetInput, setTargetInput] = useState("");
  const [randomTarget, setRandomTarget] = useState<string>();
  const [targetError, setTargetError] = useState<string>();
  const [targetAttempt, setTargetAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [attemptError, setAttemptError] = useState<string>();
  const [combinedAttempt, setCombinedAttempt] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  const submittingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isMasking = mode === "mask";
  const submissionKind = isMasking || selectedMask ? "mask" : "vote";
  const isSubmitted = !!receipts[mode] && editingMode !== mode;
  const busy = submitting || isLoading;
  const ballotRef = useInert(isMasking);
  const maskRef = useInert(!isMasking);
  const feedbackVisible = showFeedback && (busy || !!attemptError);
  const feedbackRef = useInert(!feedbackVisible);
  const isReviewMasking = reviewMode === "mask";
  const maskTarget =
    targetMode === "self" ? walletAddress : targetMode === "address" ? targetInput.trim() : randomTarget;
  const wantsMask = isReviewMasking || includeMask;
  const maskSettingsRef = useInert(!wantsMask);
  const invalidTarget = wantsMask && (!maskTarget || !isAddress(maskTarget));

  useEffect(() => {
    if (!reviewOpen || !wantsMask || targetMode !== "random" || randomTarget) return;
    let cancelled = false;
    setTargetError(undefined);
    void getRandomMaskTarget().then(
      (target) => {
        if (!cancelled) setRandomTarget(target);
      },
      (error: unknown) => {
        if (!cancelled) setTargetError(error instanceof Error ? error.message : "Could not load an eligible voter.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [reviewOpen, wantsMask, targetMode, randomTarget, getRandomMaskTarget, targetAttempt]);

  const openReview = (trigger: HTMLElement, kind: BallotKind = mode) => {
    triggerRef.current = trigger;
    setReviewMode(kind);
    setIncludeMask(false);
    setTargetMode("random");
    setTargetInput("");
    setRandomTarget(undefined);
    setTargetError(undefined);
    setReviewOpen(true);
  };

  const confirmSubmission = async () => {
    if (
      submittingRef.current ||
      isDisabled ||
      (!isReviewMasking && (voteDisabled || selectedOption === null)) ||
      invalidTarget
    )
      return;
    submittingRef.current = true;
    setSubmitting(true);
    setMode(reviewMode);
    setEditingMode(reviewMode);
    setReviewOpen(false);
    setAttemptError(undefined);
    setCombinedAttempt(!isReviewMasking && includeMask);
    if (wantsMask) setReceipts((previous) => ({ ...previous, mask: undefined }));
    setShowFeedback(true);
    const option = selectedOption;
    try {
      await submitBallotSequence({
        vote: isReviewMasking ? undefined : () => onClickVote(option!),
        mask: wantsMask ? () => onClickMask(maskTarget) : undefined,
        isCurrent: () => mounted.current,
        onStart: (kind) => {
          setSubmittedMode(kind);
        },
        onResult: (kind, result) => {
          if (!result.success) {
            setAttemptError(result.error);
            return;
          }
          setReceipts((previous) => ({
            ...previous,
            [kind]: { txHash: result.txHash, option: kind === "vote" ? option : null },
          }));
          setEditingMode(null);
        },
      });
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  const changeMode = () => {
    setMode(isMasking ? "vote" : "mask");
    setShowFeedback(false);
  };

  const editSubmission = () => {
    setEditingMode(mode);
    if (mode === "vote") setSelectedChoice(receipts.vote?.option ?? null);
    setShowFeedback(false);
  };

  const votingClosed = voteEndDate <= Math.round(Date.now() / 1000);
  const isDisabled = disabled || busy || votingClosed;
  const notStarted = voteStartDate > Math.round(Date.now() / 1000);
  const started = voteStartDate < Math.round(Date.now() / 1000);

  return (
    <BallotPanel
      title={isMasking ? "Mask ballot" : voteDisabled ? "Voting" : "Cast ballot"}
      mode={mode}
      submitted={isSubmitted}
      info={(isMasking || !voteDisabled) && <BallotSubmissionInfo submitOnChain={submitOnChain} />}
    >
      <div className="vp-body">
        {!isMasking && (!voteDisabled || isSubmitted) && votingPower}
        {!isMasking && voteDisabled && !isSubmitted && eligibilityNotice}
        {!isMasking && !voteDisabled && error && <p className="text-sm text-critical-500">{error}</p>}

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
              {!voteDisabled && (
                <p className="vp-note">
                  {receipts.vote
                    ? "You can change your vote before voting closes. Your latest submitted vote replaces the previous one."
                    : "Choose an option. Your vote stays private, and you can change it before voting closes."}
                </p>
              )}
              {isSubmitted && !isMasking ? (
                <div className="vp-confirmed-choice">
                  <span
                    className="swatch"
                    style={{ background: getColor(receipts.vote?.option ?? 0) }}
                    aria-hidden="true"
                  />
                  <strong>{options[receipts.vote?.option ?? 0]}</strong>
                </div>
              ) : !voteDisabled ? (
                <BallotChoices
                  options={options}
                  value={selectedChoice}
                  onChange={setSelectedChoice}
                  disabled={isDisabled || isSubmitted}
                  voteDisabled={voteDisabled}
                  maskAsOption={maskAsOption}
                />
              ) : null}
              {canMask && (!maskAsOption || isSubmitted || voteDisabled) && (
                <button
                  type="button"
                  className="vp-mask-entry"
                  disabled={isDisabled}
                  onClick={(event) => {
                    if (maskAsOption && !voteDisabled) {
                      setSelectedChoice("mask");
                      setEditingMode("vote");
                      setShowFeedback(false);
                    } else openReview(event.currentTarget, "mask");
                  }}
                >
                  <MaskIcon />
                  <span>
                    <strong>Submit a mask</strong>
                    <span>
                      {voteDisabled
                        ? "Add cover for an eligible voter · no voting weight"
                        : "Add cover · no voting weight"}
                    </span>
                  </span>
                  <svg
                    className="vp-mask-entry-arrow"
                    width="18"
                    height="18"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <path d="m7 5 5 5-5 5" />
                  </svg>
                </button>
              )}
            </div>
            <div className="vp-mode-view vp-mask-view" data-active={isMasking} aria-hidden={!isMasking} ref={maskRef}>
              <p className="vp-note">Add cover for other voters with an encrypted, zero-weight ballot.</p>
              <div className="vp-mask-explanation">
                <span className="vp-mask-symbol" aria-hidden="true">
                  <MaskIcon />
                </span>
                <div>
                  <p>A mask adds no voting weight.</p>
                  <p>It does not select Yes, No or Abstain, and does not replace a vote you have already cast.</p>
                  <p>You can send more than one to add cover. Each on-chain submission costs gas.</p>
                </div>
              </div>
            </div>
          </div>
        </FluidHeight>

        {/* Submission route. The ballot is encrypted and proven locally either way — this only
            decides who sends the transaction, the voter or the CRISP server acting as relayer. */}
        {(isMasking || !voteDisabled) && !isSubmitted && onChangeSubmitOnChain && (
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
          </div>
        )}
        {(isMasking || !voteDisabled) && !isSubmitted && canPublishOnChain === false && onChainBlockedReason && (
          <p className="vp-submission-error" role="status">
            {onChainBlockedReason}
          </p>
        )}

        <div className="vp-submission-results" aria-live="polite">
          {((isMasking ? ["mask"] : combinedAttempt ? ["vote", "mask"] : ["vote"]) as BallotKind[]).map((kind) =>
            receipts[kind] ? (
              <div key={kind} className="vp-submitted" role="status">
                <span aria-hidden="true">✓</span>
                <span>
                  {kind === "mask"
                    ? "Mask submitted"
                    : editingMode === "vote"
                      ? "Previous vote submitted"
                      : "Vote submitted"}
                </span>
                {receipts[kind]?.txHash && (
                  <a
                    href={`${PUB_CHAIN.blockExplorers?.default?.url}/tx/${receipts[kind]?.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View transaction
                  </a>
                )}
              </div>
            ) : null
          )}
          {attemptError && showFeedback && (
            <p className="vp-submission-error" role="alert">
              {submittedMode === "mask" ? "Mask not submitted." : "Vote not submitted."}
              {submittedMode === "mask" && combinedAttempt && receipts.vote
                ? " Your vote was submitted successfully."
                : ""}
            </p>
          )}
          {attemptError && showFeedback && submittedMode === "mask" && combinedAttempt && (
            <button
              type="button"
              className="vp-retry-mask"
              disabled={isDisabled}
              onClick={(event) => openReview(event.currentTarget, "mask")}
            >
              Try mask again
            </button>
          )}
        </div>

        {/* Actions */}
        {(isMasking || !voteDisabled) && (
          <div className="vp-cta">
            {isSubmitted ? (
              <>
                <Button
                  className="vp-edit-submission"
                  size="lg"
                  variant="secondary"
                  disabled={isDisabled}
                  onClick={(event: MouseEvent<HTMLButtonElement>) =>
                    isMasking ? openReview(event.currentTarget, "mask") : editSubmission()
                  }
                >
                  {votingClosed ? "Voting closed" : isMasking ? "Submit another mask" : "Change vote"}
                </Button>
              </>
            ) : (
              <PowerAction
                className="w-full"
                intent={submissionKind === "vote" ? "vote" : "confirm"}
                disabled={isDisabled || (submissionKind === "vote" && (voteDisabled || selectedOption === null))}
                onClick={(event: MouseEvent<HTMLButtonElement>) => openReview(event.currentTarget, submissionKind)}
              >
                <span className="vp-label-change" key={busy ? "loading" : `${mode}-${selectedOption}`}>
                  {busy ? (
                    <PleaseWaitSpinner
                      fullMessage={submittedMode === "mask" ? "Preparing mask…" : "Encrypting ballot…"}
                    />
                  ) : submissionKind === "mask" ? (
                    "Submit mask ballot"
                  ) : selectedOption !== null ? (
                    `${receipts.vote ? "Update vote" : "Submit encrypted ballot"} · ${options[selectedOption]}`
                  ) : (
                    "Select an option"
                  )}
                </span>
              </PowerAction>
            )}

            {isMasking && (
              <button type="button" disabled={isDisabled} onClick={changeMode} className="vp-foot-note vp-mode-toggle">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m12 5-7 7 7 7M5 12h14" />
                </svg>
                {receipts.vote ? "Back to your vote" : "Back to ballot"}
              </button>
            )}
          </div>
        )}

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

      <BallotReview
        open={reviewOpen && (isReviewMasking ? canMask : !voteDisabled)}
        pending={busy}
        triggerRef={triggerRef}
        onClose={() => setReviewOpen(false)}
        proposalTitle={proposalTitle}
        choice={isReviewMasking ? "Mask" : selectedOption === null ? "" : options[selectedOption]}
        optionIndex={selectedOption ?? 0}
        isMask={isReviewMasking}
        votingPower={votingPower}
      >
        <div className="ballot-mask-settings">
          {!isReviewMasking && (
            <div className="ballot-mask-option">
              <input
                id={maskOptionId}
                type="checkbox"
                checked={includeMask}
                aria-describedby={`${maskOptionId}-help`}
                onChange={(event) => setIncludeMask(event.target.checked)}
              />
              <span>
                <label htmlFor={maskOptionId}>
                  <strong>
                    <MaskIcon />
                    Also send a mask
                  </strong>
                </label>
                <span className="ui-label-with-info">
                  <span id={`${maskOptionId}-help`}>Optional · helps protect voter privacy.</span>
                  <PowerInfo label="How masks work" compact={true}>
                    <p>
                      Masks are encrypted ballots with no voting weight. They add cover for eligible voters, making real
                      votes harder to distinguish from other submissions. They do not change anyone’s vote or the
                      result.
                    </p>
                  </PowerInfo>
                </span>
              </span>
            </div>
          )}
          <FluidHeight
            expanded={wantsMask}
            collapsedHeight={0}
            className="ballot-mask-disclosure"
            data-open={wantsMask}
            aria-hidden={!wantsMask}
          >
            <div ref={maskSettingsRef}>
              <div className="ballot-mask-target">
                <label>
                  <span>Mask recipient</span>
                  <NativeSelect
                    value={targetMode}
                    onChange={(event) => setTargetMode(event.target.value as typeof targetMode)}
                  >
                    <option value="random">Random eligible voter</option>
                    <option value="self">Your wallet</option>
                    <option value="address">Another wallet</option>
                  </NativeSelect>
                </label>
                {(targetMode === "self" || (targetMode === "random" && (!randomTarget || targetError))) && (
                  <div className="ballot-mask-address" aria-live="polite">
                    {targetMode === "self" && maskTarget ? (
                      <span key={maskTarget} className="vp-label-change">
                        <AddressText bold={false}>{maskTarget}</AddressText>
                      </span>
                    ) : targetMode === "random" && !targetError ? (
                      <span>Choosing an eligible voter…</span>
                    ) : null}
                    {targetMode === "random" && targetError && (
                      <>
                        <p className="vp-submission-error" role="alert">
                          {targetError}
                        </p>
                        <button
                          type="button"
                          className="vp-retry-mask"
                          onClick={() => setTargetAttempt((attempt) => attempt + 1)}
                        >
                          Try again
                        </button>
                      </>
                    )}
                  </div>
                )}
                {targetMode === "address" && (
                  <label>
                    <span>Wallet address</span>
                    <input
                      type="text"
                      value={targetInput}
                      placeholder="0x…"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!targetInput && invalidTarget}
                      onChange={(event) => setTargetInput(event.target.value)}
                    />
                    {!!targetInput && invalidTarget && (
                      <span className="vp-submission-error">Enter a valid wallet address.</span>
                    )}
                    <span className="ballot-mask-hint">Must be eligible for this proposal.</span>
                  </label>
                )}
                <p>Adds cover for voters without changing any votes.</p>
              </div>
            </div>
          </FluidHeight>
        </div>

        <div className="ballot-review-submission">
          <strong>
            {!isReviewMasking && includeMask ? "2" : "1"}{" "}
            {submitOnChain
              ? !isReviewMasking && includeMask
                ? "transactions"
                : "transaction"
              : !isReviewMasking && includeMask
                ? "submissions"
                : "submission"}
          </strong>
          <p>
            {submitOnChain
              ? !isReviewMasking && includeMask
                ? "Vote first, then mask. Confirm each gas fee in ETH in your wallet."
                : "Confirm in your wallet, where you can review the gas fee in ETH."
              : !isReviewMasking && includeMask
                ? "Vote first, then mask. Both are sent through the relayer."
                : "Your encrypted ballot is sent through the relayer."}
          </p>
        </div>
        <PowerAction
          intent={isReviewMasking ? "confirm" : "vote"}
          disabled={isDisabled || invalidTarget || (!isReviewMasking && voteDisabled)}
          onClick={() => void confirmSubmission()}
        >
          {isReviewMasking
            ? "Submit mask ballot"
            : includeMask
              ? "Vote and mask"
              : receipts.vote
                ? "Update vote"
                : "Submit encrypted ballot"}
        </PowerAction>
      </BallotReview>

      {(isMasking || !voteDisabled) && (
        <div className="privacy">
          <span className="dot" />
          <div>
            Ballots are encrypted client-side and tallied under encryption within an Encrypted Execution Environment
            (E3). Individual votes are <em>never</em> revealed.
          </div>
        </div>
      )}
    </BallotPanel>
  );
};
