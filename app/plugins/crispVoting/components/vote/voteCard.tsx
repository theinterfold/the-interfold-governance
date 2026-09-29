import { Button } from "@aragon/ods";
import { unixTimestampToDate } from "../../utils/formatProposalDate";
import type { VotingStep } from "../../utils/types";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { useState } from "react";
import VotingStepIndicator from "./voteProgress";

export interface VoteCardProps {
  /** A genuine eligibility problem: the voter cannot fix it by waiting. Rendered as an error. */
  error?: string;
  /** A timing-only explanation (not open yet, already closed). Rendered as neutral information. */
  notice?: string;
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
  /** Send the ballot from the voter's wallet rather than via the CRISP server. */
  submitOnChain?: boolean;
  onChangeSubmitOnChain: (value: boolean) => void;
  /** Count a random weight from the top percent of the voting power instead of all of it. */
  randomWeight: boolean;
  onChangeRandomWeight: (value: boolean) => void;
  onClickMask: () => void;
  /** Masking writes someone else's slot, so the connected wallet's own voting power does not gate it. */
  maskDisabled: boolean;
}

// Interfold earth-tone palette — readable on the cream canvas
const OPTION_COLORS = ["#2f8a4f", "#a84932", "#7a7d77", "#355a8a", "#8a6a40", "#5a4a8a", "#2f7a6a", "#9a7a30"];

function getColor(index: number): string {
  return OPTION_COLORS[index % OPTION_COLORS.length];
}

export const VoteCard = ({
  error,
  notice,
  options,
  voteStartDate,
  disabled,
  isLoading,
  onClickVote,
  canPublishOnChain,
  onChainBlockedReason,
  submitOnChain = false,
  onChangeSubmitOnChain,
  randomWeight,
  onChangeRandomWeight,
  onClickMask,
  maskDisabled,
  votingStep,
  lastActiveStep,
  stepMessage,
  isCommitteeReady,
  txHash,
}: VoteCardProps) => {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isMasking, setIsMasking] = useState<boolean>(false);
  const [hasVoted, setHasVoted] = useState<boolean>(false);

  const handleVote = () => {
    if (selectedOption === null) return;
    setIsMasking(false);
    setHasVoted(true);
    onClickVote(selectedOption);
  };

  const handleMask = () => {
    setSelectedOption(null);
    setIsMasking(true);
    setHasVoted(true);
    onClickMask();
  };

  const isDisabled = disabled || isLoading;
  const notStarted = voteStartDate > Math.round(Date.now() / 1000);
  const started = voteStartDate < Math.round(Date.now() / 1000);

  return (
    <div className="vote-panel">
      <div className="vp-head">
        <h3>Cast ballot</h3>
      </div>

      <div className="vp-body">
        {error && <p className="text-sm text-critical-500">{error}</p>}
        {notice && !error && (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {notice}
          </p>
        )}

        {/* Only promise ballot-casting when the voter can actually act. Showing this above a
            "you cannot vote" line was the contradiction that made the card unreadable. */}
        {!error && !notice && (
          <p className="vp-note">
            Cast your encrypted ballot. You can change your vote at any time before voting closes. Results are tallied
            after the voting period ends. Voting from a Safe or other smart-contract wallet isn&apos;t supported yet.
          </p>
        )}

        {(isLoading || txHash || votingStep === "error" || votingStep === "complete") && (
          <VotingStepIndicator
            step={txHash && !isLoading ? "complete" : votingStep}
            lastActiveStep={lastActiveStep}
            message={txHash && !isLoading ? "Vote submitted successfully!" : stepMessage}
            txHash={txHash}
          />
        )}

        {/* `notice` already states the start time when voting has not opened, so repeating it
            here produced two copies of the same sentence. Only show this when the caller passed
            no notice (e.g. a wallet-less visitor). */}
        {notStarted && !notice && (
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

        {/* Choices */}
        <div className="vote-choices">
          {options.map((option, index) => {
            const isSelected = selectedOption === index;
            return (
              <button
                key={index}
                type="button"
                disabled={isDisabled}
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

        {/* Ballot weight. The tally publishes the total of each option and every voting power is
            public, so a ballot that counts exactly its voting power can be matched to its voter. */}
        <div className="flex flex-col gap-y-1 pt-2">
          <label className="flex items-center gap-x-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={randomWeight}
              disabled={isDisabled}
              onChange={(e) => onChangeRandomWeight(e.target.checked)}
            />
            Count a random 99–100% of my voting power
          </label>
          <p className="text-xs text-neutral-500">
            {randomWeight
              ? "Your ballot counts a random 99–100% of your voting power, not all of it. This helps protect your privacy."
              : "Your ballot counts all of your voting power. A random 99–100% helps protect your privacy."}
          </p>
        </div>

        {/* Submission route. The ballot is encrypted and proven locally either way — this only
            decides who sends the transaction, the voter or the CRISP server acting as relayer. */}
        <div className="flex flex-col gap-y-1 pt-2">
          <label className="flex items-center gap-x-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={submitOnChain}
              disabled={isDisabled || !canPublishOnChain}
              onChange={(e) => onChangeSubmitOnChain(e.target.checked)}
            />
            Send from my wallet (you pay gas)
          </label>
          <p className="text-xs text-neutral-500">
            {canPublishOnChain === false && onChainBlockedReason
              ? onChainBlockedReason
              : submitOnChain
                ? "Your wallet sends the transaction, so the chain shows your address as the sender."
                : "The CRISP server sends the transaction, so the chain shows the server as the sender. If the server cannot send it, your wallet is asked to."}
          </p>
        </div>

        {/* Actions */}
        <div className="vp-cta">
          <Button
            className="w-full"
            size="lg"
            variant="primary"
            disabled={isDisabled || selectedOption === null}
            onClick={handleVote}
          >
            {isLoading && hasVoted && !isMasking ? (
              <PleaseWaitSpinner fullMessage="Encrypting ballot…" />
            ) : selectedOption !== null ? (
              `Submit encrypted ballot · ${options[selectedOption]}`
            ) : (
              "Select an option"
            )}
          </Button>

          <button
            type="button"
            disabled={maskDisabled || isLoading}
            onClick={handleMask}
            className="vp-foot-note flex items-center justify-center gap-2 py-1"
            style={{ cursor: maskDisabled || isLoading ? "not-allowed" : "pointer", background: "none", border: 0 }}
          >
            {isLoading && isMasking ? (
              <PleaseWaitSpinner fullMessage="Masking…" />
            ) : (
              <>
                <svg
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
                <span>Mask vote instead</span>
              </>
            )}
          </button>
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
