import { groupThousands } from "@/utils/numbers";
import { ArrowsDownUp } from "@phosphor-icons/react";
import { useBallotReviewPresentation } from "./ballotReviewPresentation";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { BendingChevron } from "@/vendor/site-header";
import { ActionButton } from "@/components/input/actionButton";
import { useStepTransition } from "@/components/motion/useStepTransition";
import { AnimatedAmount } from "@/components/motion/AnimatedAmount";
import { CipherTitle } from "@/components/motion/CipherTitle";
import { Disclosure } from "@/components/motion/Disclosure";
import { useIconFlight } from "@/components/motion/useIconFlight";
import { useInert } from "@/components/motion/useInert";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { PowerInfoArrow } from "@/plugins/velocker/components/powerInfoArrow";
import { BallotOptionalAction } from "./ballot";
import styles from "./privacyTools.module.css";

/** One optional privacy action of a ballot. */
export interface PrivacyTool {
  id: string;
  title: string;
  /** A short summary, read with the row. */
  description: string;
  /** What the collapsed toggle does, shown on hover or focus. */
  hint: string;
  icon: ReactNode;
  checked: boolean;
  /** Why the tool cannot change now. The open row shows it in place of the settings, and the toggle shows it as the hint. */
  unavailable?: string;
  info: ReactNode;
  /** Revealed inside the row while the tool is on. */
  details?: ReactNode;
  onChange: (checked: boolean) => void;
}

/** Shared row spacing and checkbox alignment for optional ballot actions. */
export function BallotOptionalActionList({ children }: { children: ReactNode }) {
  return <div className={styles.rows}>{children}</div>;
}

/**
 * The privacy tools of a ballot. Collapsed, a compact bar shows one toggle for each tool. Open,
 * each tool is a full row with its help and its settings. The icons move between the two places.
 */
export function PrivacyTools({ tools, disabled = false }: { tools: PrivacyTool[]; disabled?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const flight = useIconFlight(open);
  const collapsedRef = useInert(open);
  const toggle = () => {
    flight.prepare(!open);
    setOpen(!open);
  };
  return (
    <div className={styles.group}>
      <div className={styles.divider} aria-hidden="true" />
      <section
        ref={flight.ref}
        className={styles.tools}
        data-open={open}
        data-many-tools={tools.length > 3}
        aria-labelledby={`${id}-title`}
        style={{ "--privacy-toggle-count": tools.length } as CSSProperties}
      >
        <svg className={styles.outline} aria-hidden="true" focusable="false">
          <rect vectorEffect="non-scaling-stroke" />
        </svg>
        <div className={styles.head} data-flight-size="head">
          <button
            type="button"
            className={styles.toggle}
            aria-label={open ? "Hide privacy extras" : "Show privacy extras"}
            aria-expanded={open}
            aria-controls={`${id}-options`}
            onClick={toggle}
          >
            <strong id={`${id}-title`} className={styles.title}>
              <CipherTitle label="Privacy extras" />
            </strong>
            <span className={styles.chevron} aria-hidden="true">
              <BendingChevron open={open} width={10} thickness={1.5} />
            </span>
          </button>
          <Tooltip.Provider delayDuration={180}>
            <div
              ref={collapsedRef}
              className={styles.toggles}
              data-flight-fade="closed"
              role="group"
              aria-label="Privacy tool selections"
              aria-hidden={open}
              onClickCapture={flight.finish}
              onKeyDownCapture={flight.finish}
            >
              {tools.map((tool) => (
                <PrivacyToggle key={tool.id} tool={tool} disabled={disabled} />
              ))}
            </div>
          </Tooltip.Provider>
        </div>
        <Disclosure
          id={`${id}-options`}
          open={open}
          data-flight-size="disclosure"
          onClickCapture={flight.finish}
          onKeyDownCapture={flight.finish}
        >
          <BallotOptionalActionList>
            {tools.map((tool) => (
              <BallotOptionalAction
                key={tool.id}
                id={`${id}-${tool.id}`}
                layout="compact"
                title={tool.title}
                description={tool.description}
                icon={
                  <span
                    data-flight-icon={tool.id}
                    data-flight-place="open"
                    data-flight-opacity={disabled || tool.unavailable !== undefined ? 0.5 : 1}
                  >
                    {tool.icon}
                  </span>
                }
                info={tool.info}
                checked={tool.checked}
                disabled={disabled}
                unavailable={tool.unavailable}
                onChange={tool.onChange}
              >
                {tool.details}
              </BallotOptionalAction>
            ))}
          </BallotOptionalActionList>
        </Disclosure>
      </section>
    </div>
  );
}

/** A collapsed tool: its icon toggles it, and its name and effect show on hover or focus. */
function PrivacyToggle({ tool, disabled }: { tool: PrivacyTool; disabled: boolean }) {
  // Still focusable while unavailable, so the reason stays readable.
  const unavailable = disabled || tool.unavailable !== undefined;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild={true}>
        <button
          type="button"
          className={styles.iconToggle}
          data-flight-icon={tool.id}
          data-flight-place="closed"
          data-flight-opacity={unavailable ? 0.5 : 1}
          data-active={tool.checked}
          aria-label={tool.title}
          aria-pressed={tool.checked}
          aria-disabled={unavailable}
          onClick={() => {
            if (!unavailable) tool.onChange(!tool.checked);
          }}
        >
          {tool.icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className={`power-info-popover power-info-popover--compact ${styles.tooltip}`}
          side="top"
          align="center"
          arrowPadding={12}
          sideOffset={8}
          collisionPadding={16}
        >
          <strong>{tool.title}</strong>
          <p>{tool.unavailable ?? tool.hint}</p>
          <Tooltip.Arrow asChild={true} className="power-info-arrow" width={14} height={7}>
            <PowerInfoArrow />
          </Tooltip.Arrow>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * The privacy part of a ballot review: one row for each tool beside the data it changes, then what
 * follows from those tools, such as the submission steps.
 */
export function PrivacyReview({ rows, children }: { rows: ReactNode; children?: ReactNode }) {
  const { compact } = useBallotReviewPresentation();
  return (
    <div className={styles.review} data-density={compact ? "compact" : undefined}>
      <div className={styles.reviewRows}>{rows}</div>
      {children}
    </div>
  );
}

/**
 * One tool in the review. Its icon has no frame: green while the tool is on, faded while it is
 * off. The tool's name shows on hover, focus or tap of the icon.
 */
export function PrivacyReviewRow({
  tool,
  icon,
  active,
  label,
  value,
  explanation,
}: {
  tool: string;
  icon: ReactNode;
  active: boolean;
  label: string;
  value: ReactNode;
  /** How the value is reached, from both the label and the value. */
  explanation?: { content: ReactNode; labelHelp: string; valueHelp: string };
}) {
  const { compact } = useBallotReviewPresentation();
  return (
    <div className={styles.reviewRow} data-density={compact ? "compact" : undefined}>
      <span className={styles.reviewTool}>
        <PowerInfo
          label={tool}
          compact={true}
          contentClassName={styles.reviewToolName}
          trigger={
            <span className={styles.reviewBubble} data-active={active}>
              {icon}
            </span>
          }
        >
          {tool}
        </PowerInfo>
      </span>
      <div className={styles.reviewContent}>
        {explanation ? (
          <>
            <span className={styles.explained}>
              <PowerInfo
                label={explanation.labelHelp}
                compact={true}
                contentClassName={styles.calculation}
                trigger={label}
              >
                {explanation.content}
              </PowerInfo>
            </span>
            <strong className={styles.explained}>
              <PowerInfo
                label={explanation.valueHelp}
                compact={true}
                contentClassName={styles.calculation}
                trigger={value}
              >
                {explanation.content}
              </PowerInfo>
            </strong>
          </>
        ) : (
          <>
            <span>{label}</span>
            <strong>{value}</strong>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * How the counted amount follows from the snapshot amount: aligned terms, then the formula, then
 * any rule of the round that changes the result.
 */
export function PowerCalculation({
  snapshot,
  share,
  counted,
  children,
  summary = false,
}: {
  snapshot: string;
  share: string;
  counted: string;
  children?: ReactNode;
  summary?: boolean;
}) {
  const snapshotLabel = groupThousands(snapshot);
  const countedLabel = groupThousands(counted);
  return (
    <>
      <dl className={`power-info-values ${styles.calculationTerms}`}>
        {!summary && (
          <>
            <div>
              <dt>Snapshot voting power</dt>
              <dd>{snapshotLabel}</dd>
            </div>
            <div>
              <dt>Share used</dt>
              <dd>{share}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Counted for this ballot</dt>
          <dd>{countedLabel}</dd>
        </div>
      </dl>
      {!summary && (
        <p className={styles.formula}>
          <span>{snapshotLabel}</span>
          <span>× {share}</span>
          <span>= {countedLabel}</span>
        </p>
      )}
      {children}
    </>
  );
}

/** The share of voting power a ballot uses, then the amount it counts. */
export function PowerShare({ share, counted, randomized }: { share: string; counted: string; randomized: boolean }) {
  return (
    <span className={styles.powerValues}>
      <span className={styles.powerPercent} data-active={randomized}>
        <AnimatedAmount plain={true} value={share} />
      </span>
      <AnimatedAmount plain={true} value={counted} />
    </span>
  );
}

/** The separate submissions of one review, in order. A single submission needs no list. */
export function SubmissionSteps({ steps, compact = false }: { steps: { title: string; text: string }[]; compact?: boolean }) {
  if (!compact && steps.length < 2) return null;
  return (
    <ol className={styles.steps} data-compact={compact || undefined} aria-label="Submission steps">
      {steps.map((step, index) => (
        <li key={`${index}-${step.title}`}>
          <span className={styles.stepNumber} aria-hidden="true">
            {String(index + 1).padStart(2, "0")}.
          </span>
          <p className={styles.stepTitle}>
            <strong>{step.title}</strong>
            {!compact && <span className="sr-only">: </span>}
            {!compact && <span className={styles.stepText}>{step.text}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Stable action identities carry their content through a reversal, with the control outside the moving rows. */
export function SubmissionOrder({ steps, onReverse, disabled = false, reverseUnavailableReason }: {
  steps: { title: string; icon: ReactNode; detail?: ReactNode; future?: boolean }[];
  onReverse?: () => void;
  disabled?: boolean;
  reverseUnavailableReason?: string;
}) {
  const motion = useStepTransition<HTMLElement>(steps.map(step => step.title).join("|"), true);
  if (!steps.length) return null;
  const reverse = () => {
    if (disabled || reverseUnavailableReason || !onReverse) return;
    motion.prepare();
    onReverse();
  };
  return <section ref={motion.ref} className={styles.order} aria-label="Submission order">
    <span className={styles.orderLabel}>Actions</span>
    <div className={styles.orderFrame} data-swappable={!!onReverse || undefined}>
      <ol className={styles.orderSteps} style={{gridRow:`1 / span ${steps.length}`}} aria-live="polite" aria-label="Submission steps">
        {steps.map(step => <li key={step.title} data-step-key={`submission-${step.title}`} data-future={step.future || undefined}>
          <div className={styles.orderItem}><span className={styles.orderItemIcon}>{step.icon}</span><div className={styles.orderItemContent}><span>{step.title}</span>{step.detail && <div className={styles.orderDetail}>{step.detail}</div>}</div></div>
        </li>)}
      </ol>
      {onReverse && <div className={styles.orderConnector}>
        <ActionButton size="compact" onClick={reverse} disabled={disabled || !!reverseUnavailableReason}>
          <ArrowsDownUp size={16} aria-hidden="true" /><span>Swap order</span>
        </ActionButton>
        <PowerInfo label="Why swap the order?" compact={true}>
          {reverseUnavailableReason ? <p>{reverseUnavailableReason}</p> : <>
            <p>Choose which goes first so votes and masks do not always follow the same sending pattern.</p>
            <p>Your choice, voting power and recipients stay the same.</p>
          </>}
        </PowerInfo>
      </div>}
    </div>
  </section>;
}
