import { useEffect, useRef, useId, useState, useCallback, type ReactNode, type RefObject } from "react";
import { ActionIcon } from "@/components/input/actionIcon";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { Disclosure } from "@/components/motion/Disclosure";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { useBallotReviewPresentation } from "./ballotReviewPresentation";
import { ArrowDown, ArrowUp, Prohibit } from "@phosphor-icons/react";
import { useBallotPresentation } from "./ballotPresentation";

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

/**
 * Optional ballot actions share their checkbox, states and motion across layouts. An unavailable
 * action is disabled and shows its reason where its settings would open.
 */
export function BallotOptionalAction({
  id,
  title,
  description,
  icon,
  checked,
  disabled = false,
  unavailable,
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
  /** Why the action cannot change now. */
  unavailable?: string;
  layout?: "card" | "compact" | "inline";
  info?: ReactNode;
  children?: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  const blocked = disabled || unavailable !== undefined;
  const control = (
    <label
      className="ballot-optional-card"
      data-layout={layout}
      data-checked={checked}
      data-disabled={blocked}
      data-help={!!info}
    >
      <input
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={blocked}
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
  if (!info && !children && unavailable === undefined) return control;
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
      {(children || unavailable !== undefined) && (
        <Disclosure open={checked || unavailable !== undefined}>
          <div className="ballot-optional-details">
            {unavailable === undefined ? children : <p className="ballot-optional-note">{unavailable}</p>}
          </div>
        </Disclosure>
      )}
    </div>
  );
}

/** Three ballot papers with the selected vote marked on the central one. */
export function BallotIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      <path d="M1.5 18.5h21M8 18.5V8h8v10.5M8 10.5l-5.5 1.25L4 18.5M16 10.5l5.5 1.25-1.5 6.75" />
      <path d="m10 12.5 1.5 1.5 2.5-2.5" />
    </svg>
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
  heading,
  mode = "vote",
  className = "",
  submitted = false,
  info,
  navigation,
  children,
}: {
  /** Omit when the submission state supplies the panel's own heading. */
  title?: string;
  heading?: ReactNode;
  mode?: "vote" | "mask";
  className?: string;
  submitted?: boolean;
  info?: ReactNode;
  /** Optional route selector, centered above the panel heading. */
  navigation?: ReactNode;
  children: ReactNode;
}) {
  const hasHeading = Boolean(heading) || Boolean(title) || Boolean(info);
  return (
    <div className={`vote-panel ${className}`} data-vote-mode={mode} data-vote-submitted={submitted} data-has-heading={hasHeading}>
      {navigation && <div className="vp-navigation">{navigation}</div>}
      {hasHeading && (
        <div className={`vp-head${info ? " vp-head-with-info" : ""}`}>
          {heading ?? (title && <h3 aria-live="polite">
            <span key={title} className="vp-label-change">{title}</span>
          </h3>)}
          {info}
        </div>
      )}
      {children}
    </div>
  );
}

export function BallotSubmissionInfo({
  submitOnChain,
  anotherWallet = false,
  includeMask = false,
}: {
  submitOnChain: boolean;
  anotherWallet?: boolean;
  includeMask?: boolean;
}) {
  return (
    <PowerInfo label="About ballot submission and fees" compact={true}>
      <p>
        Ballots are encrypted client-side and tallied under encryption within an Encrypted Execution Environment
        (E3). Individual votes are <em>never</em> revealed.
      </p>
      {anotherWallet && (
        <p>
          Prepare the vote with your voting wallet, then switch wallets to publish it. The sending wallet pays gas;
          your voting power still comes from the wallet that signed the ballot.
        </p>
      )}
      {(!anotherWallet || includeMask) && (
        <p>
          {anotherWallet && "For your masks: "}
          {submitOnChain
            ? "Your wallet publishes the transaction without relying on the relayer to send it. You pay gas and can review the fee in your wallet before confirming. Your wallet address is visible as the sender."
            : "Interfold currently covers gas when the relayer sends your encrypted ballot. If it cannot send, you can choose to publish from your wallet and pay gas. Your ballot remains encrypted."}
        </p>
      )}
    </PowerInfo>
  );
}

export function BallotChoices({
  options,
  value,
  currentVote,
  onChange,
  onClear,
  disabled = false,
  voteDisabled = false,
  maskAsOption = false,
  maskUnavailable = false,
  presentation = "framed",
}: {
  options: string[];
  value: BallotChoice | null;
  /** The submitted choice remains marked while a different draft option is selected. */
  currentVote?: number | null;
  onChange: (choice: BallotChoice) => void;
  /** Selecting the chosen option again calls this, so the ballot can return to no choice. */
  onClear?: () => void;
  disabled?: boolean;
  voteDisabled?: boolean;
  maskAsOption?: boolean;
  /** Public ballots retain the secret-ballot affordance as an explained unavailable choice. */
  maskUnavailable?: boolean;
  /** Approved framed choices by default; other treatments are for local comparisons. */
  presentation?: BallotChoicePresentation;
}) {
  const groupId = useId();
  const { choices: choiceLayout } = useBallotPresentation();
  const choices: { value: BallotChoice; label: string }[] = options.map((label, index) => ({ value: index, label }));
  if (maskAsOption) choices.push({ value: "mask", label: "Submit a mask" });
  return (
    <div className="vote-choices" data-presentation={presentation} data-layout={choiceLayout} role="radiogroup" aria-label="Ballot choice">
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
              // A checked radio fires no change event, so selecting it again by pointer or with the
              // space key clears the choice instead.
              onClick={selected ? onClear : undefined}
              onKeyDown={(event) => {
                if (!selected || !onClear || event.key !== " ") return;
                event.preventDefault();
                onClear();
              }}
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
  choiceDetail,
  previousChoice,
  footerContext,
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
  choiceDetail?: ReactNode;
  previousChoice?: string;
  footerContext?: ReactNode;
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
  const { compact, comparison, powerPresentation = "inline" } = useBallotReviewPresentation();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyElement, setBodyElement] = useState<HTMLDivElement | null>(null);
  const attachBody = useCallback((element: HTMLDivElement | null) => {
    bodyRef.current = element;
    setBodyElement(element);
  }, []);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const scrollCueRef = useRef<HTMLButtonElement>(null);
  const scrollId = useId();
  const [scrollState, setScrollState] = useState({ overflow: false, below: false });
  const measureScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body || !body.clientHeight) return;
    // Measure against the space without the cue so showing it cannot create overflow by itself.
    const overflow = body.scrollHeight > body.clientHeight + (scrollCueRef.current?.offsetHeight ?? 0) + 2;
    const below = overflow && body.scrollHeight - body.clientHeight - body.scrollTop > 2;
    setScrollState(previous => previous.overflow === overflow && previous.below === below ? previous : { overflow, below });
  }, []);
  const reviewScroll = useRef(0);
  const returning = useRef(false);
  const restoringScroll = useRef(false);
  const detailsOpen = detailView?.open ?? false;
  const detailTriggerRef = detailView?.triggerRef;
  useEffect(() => {
    if (!open) {
      setScrollState({ overflow: false, below: false });
      return;
    }
    const body = bodyRef.current;
    const content = scrollContentRef.current;
    if (!body || !content) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureScroll);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(body);
    observer.observe(content);
    schedule();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [open, bodyElement, detailsOpen, measureScroll]);
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
      {!(compact && isMask) && <div className="ballot-review-summary">
        <div className="ballot-review-row" data-integrated-power={compact && !!choiceDetail || undefined} data-power-layout={compact && choiceDetail ? powerPresentation : undefined}>
          <span>{compact && previousChoice ? previousChoice === choice ? "Your vote" : `Changing from ${previousChoice} to` : isMask ? "Sending" : emphasis === "choice" ? "You're voting" : "Your vote"}</span>
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
            <span className="ballot-review-choice-text">{choice}</span>
          </strong>
          {compact && choiceDetail && <div className="ballot-review-choice-detail" data-power-presentation={powerPresentation}>{choiceDetail}</div>}
        </div>
        {!isMask && votingPower}
      </div>}
      {children}
      {footerContext && <div className="ballot-review-footer-context">{footerContext}</div>}
    </>
  );
  return (
    <ActionTray
      open={open}
      title={detailView?.open ? detailView.title : compact && previousChoice ? "Confirm vote change" : isMask ? compact && choice !== "1 mask" ? "Confirm masks" : "Confirm mask" : "Confirm your vote"}
      pending={pending}
      triggerRef={triggerRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      onCloseComplete={onCloseComplete}
      onBack={detailView?.open ? detailView.onBack : undefined}
      backLabel="Back to review"
      className={`ballot-review${compact ? " ballot-review-compact" : ""}${detailView ? " ballot-review-lateral" : ""}${emphasis === "choice" ? " ballot-review-choice-first" : ""}${footer ? " ballot-review-with-footer" : ""}${footerContext ? " ballot-review-with-footer-context" : ""}${signatureExpanded ? " ballot-review-signature-expanded" : ""}`}
    >
      {!detailsOpen && comparison}
      <div
        ref={attachBody}
        id={scrollId}
        className="ballot-review-body"
        tabIndex={scrollState.overflow ? 0 : undefined}
        role={scrollState.overflow ? "region" : undefined}
        aria-label={scrollState.overflow ? detailsOpen ? "Signature data details" : isMask ? "Mask review details" : "Vote review details" : undefined}
        onScroll={(event) => {
          if (!detailsOpen && !restoringScroll.current) reviewScroll.current = event.currentTarget.scrollTop;
          measureScroll();
        }}
      >
        <div ref={scrollContentRef} className="ballot-review-scroll-content">
        {detailView ? (
          <FluidHeight layoutKey={`${detailView.open ? "details" : "review"}-${compact}`}>
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
      </div>
      {scrollState.overflow && <button
        ref={scrollCueRef}
        type="button"
        className="ui-text-action ballot-review-scroll-cue"
        data-more-below={scrollState.below || undefined}
        aria-controls={scrollId}
        onClick={() => {
          const body = bodyRef.current;
          if (!body) return;
          const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
          body.scrollTo({ top: scrollState.below ? body.scrollTop + body.clientHeight * 0.8 : 0, behavior });
        }}
      >
        {scrollState.below ? <>More details below <ArrowDown size={14} aria-hidden="true" /></> : <>Back to top <ArrowUp size={14} aria-hidden="true" /></>}
      </button>}
      {footer && (
        <Disclosure open={!detailsOpen} className="ballot-review-footer-disclosure">
          <div className="ballot-review-footer">{footer}</div>
        </Disclosure>
      )}
    </ActionTray>
  );
}
