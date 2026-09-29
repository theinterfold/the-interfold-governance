import { useId, type ReactNode, type RefObject } from "react";
import { ActionIcon } from "@/components/input/actionIcon";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";

const OPTION_COLORS = ["#2f8a4f", "#a84932", "#7a7d77", "#355a8a", "#8a6a40", "#5a4a8a", "#2f7a6a", "#9a7a30"];

export const ballotOptionColor = (index: number) => OPTION_COLORS[index % OPTION_COLORS.length];
export type BallotChoice = number | "mask";

/** Optional ballot actions share one checkbox-card presentation in every review. */
export function BallotOptionalAction({
  id,
  title,
  description,
  icon,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="ballot-optional-card" data-checked={checked} data-disabled={disabled}>
      <input
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ballot-optional-symbol" aria-hidden="true">
        {icon}
      </span>
      <span className="ballot-optional-check" aria-hidden="true">
        <ActionIcon name="check" />
      </span>
      <strong id={`${id}-title`}>{title}</strong>
      <span id={`${id}-help`} className="ballot-optional-description">
        {description}
      </span>
    </label>
  );
}

export function MaskIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 8.5c3-1.5 6-1.5 10 .5 4-2 7-2 10-.5l-1.2 5c-.5 2-2.2 3-4.1 3-2.1 0-3.3-1.2-4.7-3-1.4 1.8-2.6 3-4.7 3-1.9 0-3.6-1-4.1-3L2 8.5Z" />
      <path d="M5.5 11.2c1.4-.5 2.6-.2 3.7.7-1.3.8-2.5.6-3.7-.7ZM18.5 11.2c-1.4-.5-2.6-.2-3.7.7 1.3.8 2.5.6 3.7-.7Z" />
    </svg>
  );
}

/** The same voting surface in embedded and full-page, public and secret proposals. */
export function BallotPanel({
  title,
  mode = "vote",
  submitted = false,
  info,
  children,
}: {
  title: string;
  mode?: "vote" | "mask";
  submitted?: boolean;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="vote-panel" data-vote-mode={mode} data-vote-submitted={submitted}>
      <div className="vp-head">
        <h3 aria-live="polite">
          <span key={title} className="vp-label-change">
            {title}
          </span>
        </h3>
        {info}
      </div>
      {children}
    </div>
  );
}

export function BallotSubmissionInfo({ submitOnChain }: { submitOnChain: boolean }) {
  return (
    <PowerInfo label="About ballot submission and fees" compact={true}>
      <p>Your ballot is encrypted on your device before it is sent.</p>
      <p>
        {submitOnChain
          ? "Your wallet submits it on-chain. You pay the gas fee in ETH and can review it in your wallet before confirming."
          : "The relayer submits your encrypted ballot. Your vote stays private."}
      </p>
    </PowerInfo>
  );
}

export function BallotChoices({
  options,
  value,
  onChange,
  disabled = false,
  voteDisabled = false,
  maskAsOption = false,
  maskUnavailableReason,
}: {
  options: string[];
  value: BallotChoice | null;
  onChange: (choice: BallotChoice) => void;
  disabled?: boolean;
  voteDisabled?: boolean;
  maskAsOption?: boolean;
  maskUnavailableReason?: string;
}) {
  const groupId = useId();
  const choices: { value: BallotChoice; label: string }[] = options.map((label, index) => ({ value: index, label }));
  if (maskAsOption || maskUnavailableReason) choices.push({ value: "mask", label: "Submit a mask" });
  return (
    <div className="vote-choices" role="radiogroup" aria-label="Ballot choice">
      {choices.map((choice) => {
        const selected = value === choice.value;
        const isMask = choice.value === "mask";
        if (isMask && maskUnavailableReason) {
          return <UnavailableMaskChoice key={choice.value} reason={maskUnavailableReason} />;
        }
        const choiceDisabled = disabled || (!isMask && voteDisabled);
        return (
          <label
            key={choice.value}
            data-disabled={choiceDisabled}
            className={`vote-choice ${selected ? "selected" : ""} ${isMask ? "vote-choice-mask" : ""}`}
          >
            <input
              className="sr-only"
              type="radio"
              name={groupId}
              value={choice.value}
              checked={selected}
              disabled={choiceDisabled}
              aria-label={choice.label}
              aria-describedby={isMask ? `${groupId}-mask-hint` : undefined}
              onChange={() => onChange(choice.value)}
            />
            <span className="label">
              <span className="vote-choice-symbol">
                {isMask ? (
                  <MaskIcon />
                ) : (
                  <span className="swatch" style={{ background: ballotOptionColor(choice.value as number) }} />
                )}
              </span>
              {isMask ? (
                <span className="vote-choice-copy">
                  <span>{choice.label}</span>
                  <span id={`${groupId}-mask-hint`} className="vote-choice-hint">
                    Adds cover for voters without changing any votes.
                  </span>
                </span>
              ) : (
                <span className="truncate">{choice.label}</span>
              )}
            </span>
            <span className="mark" aria-hidden="true">
              {selected && <ActionIcon name="check" />}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Focusable for its explanation, but never selects a ballot or calls onChange. */
function UnavailableMaskChoice({ reason }: { reason: string }) {
  const hintId = useId();

  return (
    <button
      type="button"
      role="radio"
      aria-label="Submit a mask"
      aria-checked={false}
      aria-disabled={true}
      aria-describedby={hintId}
      data-disabled={true}
      className="vote-choice vote-choice-mask vote-choice-mask-unavailable"
      onClick={(event) => {
        event.preventDefault();
        const row = event.currentTarget;
        row.getAnimations().forEach((animation) => animation.cancel());
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const restingBorder = getComputedStyle(row).borderColor;
        row.animate(
          reducedMotion
            ? [{ borderColor: "#a84932" }, { borderColor: restingBorder }]
            : [
                { transform: "translateX(0)", borderColor: "#a84932" },
                { transform: "translateX(-3px)" },
                { transform: "translateX(3px)" },
                { transform: "translateX(-2px)" },
                { transform: "translateX(2px)" },
                { transform: "translateX(0)", borderColor: restingBorder },
              ],
          { duration: 360, easing: "ease-out" }
        );
      }}
    >
      <span className="label">
        <span className="vote-choice-symbol">
          <MaskIcon />
        </span>
        <span className="vote-choice-copy">
          <span>Submit a mask</span>
          <span id={hintId} className="vote-choice-hint">
            {reason}
          </span>
        </span>
      </span>
      <span className="mark" aria-hidden="true">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="m6 6 12 12" />
        </svg>
      </span>
    </button>
  );
}

/** Method-specific details (masking, privacy, fees) are slots in a shared review. */
export function BallotReview({
  open,
  pending,
  triggerRef,
  onClose,
  proposalTitle,
  choice,
  optionIndex = 0,
  isMask = false,
  votingPower,
  children,
}: {
  open: boolean;
  pending: boolean;
  triggerRef: RefObject<HTMLElement>;
  onClose: () => void;
  proposalTitle?: string;
  choice: string;
  optionIndex?: number;
  isMask?: boolean;
  votingPower?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ActionTray
      open={open}
      title={isMask ? "Confirm mask" : "Confirm your vote"}
      pending={pending}
      triggerRef={triggerRef}
      onClose={onClose}
      className="ballot-review"
    >
      <div className="ballot-review-body">
        {proposalTitle && <p className="ballot-review-proposal">{proposalTitle}</p>}
        <div className="ballot-review-summary">
          <div className="ballot-review-row">
            <span>{isMask ? "Ballot" : "Your vote"}</span>
            <strong
              className="ballot-review-choice"
              style={{
                borderColor: isMask ? undefined : `${ballotOptionColor(optionIndex)}40`,
                backgroundColor: isMask ? undefined : `${ballotOptionColor(optionIndex)}0d`,
              }}
            >
              {isMask ? (
                <MaskIcon />
              ) : (
                <span className="swatch" style={{ background: ballotOptionColor(optionIndex) }} aria-hidden="true" />
              )}
              {choice}
            </strong>
          </div>
          {isMask ? (
            <div className="ballot-review-row">
              <span>Voting weight</span>
              <strong>None</strong>
            </div>
          ) : (
            votingPower
          )}
        </div>
        {children}
      </div>
    </ActionTray>
  );
}
