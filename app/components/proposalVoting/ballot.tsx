import { useEffect, useRef, useId, type ReactNode, type RefObject } from "react";
import { ActionIcon } from "@/components/input/actionIcon";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { Disclosure } from "@/components/motion/Disclosure";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { Prohibit } from "@phosphor-icons/react";

const OPTION_COLORS = [
  "var(--if-brand-green)",
  "var(--if-negative)",
  "var(--if-abstain)",
  "#355a8a",
  "#8a6a40",
  "#5a4a8a",
  "#2f7a6a",
  "#9a7a30",
];

export const ballotOptionColor = (index: number) => OPTION_COLORS[index % OPTION_COLORS.length];
export type BallotChoice = number | "mask";
export type BallotChoicePresentation = "current" | "decision" | "framed" | "ink" | "tiles" | "emphasis";

/** Optional ballot actions share their checkbox, states and motion across layouts. */
export function BallotOptionalAction({
  id,
  title,
  description,
  icon,
  checked,
  disabled = false,
  layout = "card",
  info,
  children,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  icon?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  layout?: "card" | "row" | "compact";
  info?: ReactNode;
  children?: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  const control = (
    <label
      className="ballot-optional-card"
      data-layout={layout}
      data-checked={checked}
      data-disabled={disabled}
      data-help={!!info}
    >
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
      {icon && (
        <span className="ballot-optional-symbol" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="ballot-optional-check" aria-hidden="true">
        <ActionIcon name="check" />
      </span>
      <strong id={`${id}-title`}>{title}</strong>
      <span id={`${id}-help`} className="ballot-optional-description">
        {description}
      </span>
    </label>
  );
  if (!info && !children) return control;
  return (
    <div className="ballot-optional-group" data-layout={layout} data-checked={checked}>
      {control}
      {info && (
        <span className="ballot-optional-info">
          <PowerInfo compact={true} label={`About ${title.toLowerCase()}`}>
            {info}
          </PowerInfo>
        </span>
      )}
      {children && (
        <Disclosure open={checked}>
          <div className="ballot-optional-details">{children}</div>
        </Disclosure>
      )}
    </div>
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
  className = "",
  submitted = false,
  info,
  children,
}: {
  title: string;
  mode?: "vote" | "mask";
  className?: string;
  submitted?: boolean;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`vote-panel ${className}`} data-vote-mode={mode} data-vote-submitted={submitted}>
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
  currentVote,
  onChange,
  disabled = false,
  voteDisabled = false,
  maskAsOption = false,
  maskUnavailable = false,
  presentation,
}: {
  options: string[];
  value: BallotChoice | null;
  /** The submitted choice remains marked while a different draft option is selected. */
  currentVote?: number | null;
  onChange: (choice: BallotChoice) => void;
  disabled?: boolean;
  voteDisabled?: boolean;
  maskAsOption?: boolean;
  /** Public ballots retain the secret-ballot affordance as an explained unavailable choice. */
  maskUnavailable?: boolean;
  /** Opt-in local comparison treatments; omitting this preserves the standard ballot. */
  presentation?: BallotChoicePresentation;
}) {
  const groupId = useId();
  const choices: { value: BallotChoice; label: string }[] = options.map((label, index) => ({ value: index, label }));
  if (maskAsOption) choices.push({ value: "mask", label: "Submit a mask" });
  return (
    <div className="vote-choices" data-presentation={presentation} role="radiogroup" aria-label="Ballot choice">
      {choices.map((choice, index) => {
        const selected = value === choice.value;
        const isMask = choice.value === "mask";
        const isCurrentVote = !isMask && currentVote === choice.value;
        const choiceDisabled = disabled || (!isMask && voteDisabled);
        return (
          <label
            key={choice.value}
            data-disabled={choiceDisabled}
            data-choice-number={String(index + 1).padStart(2, "0")}
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
              aria-describedby={isMask ? `${groupId}-mask-hint` : isCurrentVote ? `${groupId}-current-vote` : undefined}
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
            {isCurrentVote && (
              <span id={`${groupId}-current-vote`} className="vote-choice-current vote-choice-hint">
                Current vote
              </span>
            )}
            <span className="mark" aria-hidden="true">
              {selected && <ActionIcon name="check" />}
            </span>
          </label>
        );
      })}
      {maskUnavailable && !maskAsOption && <UnavailableMaskChoice />}
    </div>
  );
}

function UnavailableMaskChoice() {
  const id = useId();
  const animation = useRef<Animation | null>(null);
  useEffect(() => () => animation.current?.cancel(), []);
  const explain = (element: HTMLDivElement) => {
    animation.current?.cancel();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const style = getComputedStyle(element);
    const ink = style.getPropertyValue("--ink").trim();
    const border = style.borderColor;
    animation.current = element.animate(
      [
        { borderColor: border, ...(reduceMotion ? {} : { transform: "translateX(0)" }) },
        { borderColor: ink, ...(reduceMotion ? {} : { transform: "translateX(-3px)" }) },
        { borderColor: ink, ...(reduceMotion ? {} : { transform: "translateX(3px)" }) },
        { borderColor: border, ...(reduceMotion ? {} : { transform: "translateX(0)" }) },
      ],
      {
        duration: parseFloat(style.getPropertyValue("--interfold-ui-duration")) || 320,
        easing: style.getPropertyValue("--interfold-ui-ease").trim() || "ease-out",
      }
    );
  };
  return (
    <div
      className="vote-choice vote-choice-mask focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      role="radio"
      aria-checked="false"
      aria-disabled="true"
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-help`}
      data-disabled="true"
      tabIndex={0}
      onClick={(event) => explain(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          explain(event.currentTarget);
        }
      }}
    >
      <span className="label">
        <span className="vote-choice-symbol">
          <Prohibit size={24} weight="regular" aria-hidden="true" />
        </span>
        <span className="vote-choice-copy">
          <span id={`${id}-label`}>Submit a mask</span>
          <span id={`${id}-help`} className="vote-choice-hint">
            Only available for secret ballots
          </span>
        </span>
      </span>
      <span className="mark" aria-hidden="true" />
    </div>
  );
}

/** Method-specific details (masking, privacy, fees) are slots in a shared review. */
export function BallotReview({
  open,
  pending,
  triggerRef,
  returnFocusRef,
  onClose,
  onCloseComplete,
  proposalTitle,
  choice,
  optionIndex = 0,
  isMask = false,
  emphasis = "standard",
  votingPower,
  footer,
  signatureExpanded = false,
  detailView,
  children,
}: {
  open: boolean;
  pending: boolean;
  triggerRef: RefObject<HTMLElement>;
  returnFocusRef?: RefObject<HTMLElement>;
  onClose: () => void;
  onCloseComplete?: () => void;
  proposalTitle?: string;
  choice: string;
  optionIndex?: number;
  isMask?: boolean;
  emphasis?: "standard" | "choice";
  votingPower?: ReactNode;
  footer?: ReactNode;
  signatureExpanded?: boolean;
  detailView?: {
    open: boolean;
    title: string;
    content: ReactNode;
    onBack: () => void;
    triggerRef: RefObject<HTMLElement>;
  };
  children: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const reviewScroll = useRef(0);
  const returning = useRef(false);
  const restoringScroll = useRef(false);
  const detailsOpen = detailView?.open ?? false;
  const detailTriggerRef = detailView?.triggerRef;
  useEffect(() => {
    if (!open) {
      returning.current = false;
      restoringScroll.current = false;
      return;
    }
    if (!detailTriggerRef) return;
    if (detailsOpen) {
      returning.current = true;
      bodyRef.current?.scrollTo({ top: 0 });
      bodyRef.current?.querySelector<HTMLElement>('[aria-label="Signature data"]')?.focus({ preventScroll: true });
    } else if (returning.current) {
      returning.current = false;
      const savedScroll = reviewScroll.current;
      restoringScroll.current = true;
      bodyRef.current?.scrollTo({ top: savedScroll });
      detailTriggerRef.current?.focus({ preventScroll: true });
      let cancelled = false;
      const frame = requestAnimationFrame(() => {
        const animations = bodyRef.current?.getAnimations({ subtree: true }) ?? [];
        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
          if (cancelled) return;
          bodyRef.current?.scrollTo({ top: savedScroll });
          restoringScroll.current = false;
        });
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        restoringScroll.current = false;
      };
    }
  }, [open, detailsOpen, detailTriggerRef]);
  const reviewContent = (
    <>
      {proposalTitle && <p className="ballot-review-proposal">{proposalTitle}</p>}
      <div className="ballot-review-summary">
        <div className="ballot-review-row">
          <span>{isMask ? "Ballot" : emphasis === "choice" ? "You're voting" : "Your vote"}</span>
          <strong
            className="ballot-review-choice"
            style={
              emphasis === "choice"
                ? undefined
                : {
                    borderColor: isMask
                      ? undefined
                      : `color-mix(in srgb, ${ballotOptionColor(optionIndex)} 25%, transparent)`,
                    backgroundColor: isMask
                      ? undefined
                      : `color-mix(in srgb, ${ballotOptionColor(optionIndex)} 5%, transparent)`,
                  }
            }
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
            <span>Voting power</span>
            <strong>None</strong>
          </div>
        ) : (
          votingPower
        )}
      </div>
      {children}
    </>
  );
  return (
    <ActionTray
      open={open}
      title={detailView?.open ? detailView.title : isMask ? "Confirm mask" : "Confirm your vote"}
      pending={pending}
      triggerRef={triggerRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      onCloseComplete={onCloseComplete}
      onBack={detailView?.open ? detailView.onBack : undefined}
      backLabel="Back to review"
      className={`ballot-review${detailView ? " ballot-review-lateral" : ""}${emphasis === "choice" ? " ballot-review-choice-first" : ""}${footer ? " ballot-review-with-footer" : ""}${signatureExpanded ? " ballot-review-signature-expanded" : ""}`}
    >
      <div
        ref={bodyRef}
        className="ballot-review-body"
        onScroll={(event) => {
          if (!detailsOpen && !restoringScroll.current) reviewScroll.current = event.currentTarget.scrollTop;
        }}
      >
        {detailView ? (
          <FluidHeight layoutKey={detailView.open ? "details" : "review"}>
            <div className="motion-tab-panels">
              <MotionPanel active={!detailView.open} direction="left">
                <div className="ballot-review-content">{reviewContent}</div>
              </MotionPanel>
              <MotionPanel active={detailView.open} direction="right">
                {detailView.content}
              </MotionPanel>
            </div>
          </FluidHeight>
        ) : (
          reviewContent
        )}
      </div>
      {footer && (
        <Disclosure open={!detailsOpen} className="ballot-review-footer-disclosure">
          <div className="ballot-review-footer">{footer}</div>
        </Disclosure>
      )}
    </ActionTray>
  );
}
