import { StatusBadge } from "@/components/text/statusBadge";
import { ActionButton } from "@/components/input/actionButton";
import { BendingChevron } from "@/vendor/site-header";
import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { AddressText } from "@/components/text/address";
import { useInert } from "@/components/motion/useInert";
import { ProposalCountdown, formatEndsIn } from "@/components/proposal/proposalCountdown";

export type RowBar = { width: number; color: string; label: string };

export interface ProposalRowProps {
  href: string;
  /** "Secret ballot" | "Transparent fallback" — drives the editorial kind column. */
  kindLabel: string;
  loading?: boolean;
  loadingMessage?: string;
  title?: string;
  summary?: string;
  creator?: string;
  statusLabel?: string;
  statusClass?: string;
  /** An open voting window, independent of this wallet's eligibility. */
  votingOpen?: boolean;
  votingEndMs?: number;
  rightLabel?: string;
  bars?: RowBar[];
  resultLabel?: string;
  resultMessage?: string;
  details?: ReactNode;
  /**
   * Filtered out by the active status filter. The row stays mounted (its hooks
   * are what resolve the status in the first place) but renders nothing.
   */
  hidden?: boolean;
}

/** Shared presentational row so secret-ballot (CRISP) and transparent fallback (TokenVoting) proposals render identically. */
export function ProposalRow(props: ProposalRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [expiredDeadline, setExpiredDeadline] = useState<number>();
  const votingOpen = !!props.votingOpen && (props.votingEndMs === undefined || expiredDeadline !== props.votingEndMs);
  const panelRef = useInert(!expanded);
  const panelId = useId();
  const titleId = useId();
  const rowRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const title = props.title?.trim().length ? props.title : "Untitled proposal";

  const collapse = () => {
    const aboveViewport = (rowRef.current?.getBoundingClientRect().top ?? 0) < 80;
    setExpanded(false);
    toggleRef.current?.focus({ preventScroll: true });
    if (aboveViewport) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      rowRef.current?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }
  };

  const toggle = () => {
    if (expanded) return collapse();
    setHasOpened(true);
    setExpanded(true);
  };

  if (props.loading) {
    return (
      <article className="proposal-item" hidden={props.hidden}>
        <div className="proposal-row proposal-row-loading">
          <PleaseWaitSpinner fullMessage={props.loadingMessage ?? "Loading…"} />
        </div>
      </article>
    );
  }

  return (
    <article
      ref={rowRef}
      className="proposal-item"
      data-expanded={expanded}
      data-voting-open={votingOpen}
      data-status={props.statusClass}
      hidden={props.hidden}
    >
      <header className="proposal-row">
        <div className="body">
          <div className="meta">
            {props.statusLabel && <StatusBadge className={props.statusClass}>{props.statusLabel}</StatusBadge>}
            <span className="proposal-method">{props.kindLabel}</span>
          </div>
          <h2 id={titleId}>
            <Link href={props.href} className="proposal-title-link" scroll={false}>
              {title}
            </Link>
          </h2>
          <p className="summary line-clamp-2">{props.summary}</p>
          <div className="author">
            <em>By</em>
            <AddressText bold={false}>{props.creator}</AddressText>
          </div>
        </div>
        <div className="right">
          {props.rightLabel && (
            <span className="time">
              {votingOpen && props.votingEndMs ? (
                <ProposalCountdown endMs={props.votingEndMs} onEnd={() => setExpiredDeadline(props.votingEndMs)} />
              ) : expiredDeadline === props.votingEndMs && expiredDeadline !== undefined ? (
                "Voting ended"
              ) : (
                props.rightLabel
              )}
            </span>
          )}
          <div className="proposal-result">
            {props.resultLabel !== props.kindLabel && (
              <span className="proposal-result-label">{props.resultLabel ?? "Voting results"}</span>
            )}
            {props.bars && props.bars.length > 0 && (
              <>
                <div className="mini-bar" aria-hidden="true">
                  {props.bars.map((b, i) =>
                    b.width > 0 ? <span key={i} style={{ width: `${b.width}%`, background: b.color }} /> : null
                  )}
                </div>
                <ul className="proposal-result-legend" aria-label="Share of voting weight cast">
                  {props.bars.map((bar, i) => (
                    <li key={`${bar.label}-${i}`}>
                      <span className="proposal-result-dot" style={{ background: bar.color }} aria-hidden="true" />
                      <span>{bar.label}</span>
                      <span>{new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(bar.width)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {props.resultMessage && <p className="proposal-result-message">{props.resultMessage}</p>}
          </div>
          <ActionButton
            ref={toggleRef}
            type="button"
            intent={votingOpen && !expanded ? "vote" : "open"}
            className="proposal-row-action"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={toggle}
          >
            <span>
              {expanded
                ? "Close details"
                : votingOpen
                  ? "Vote"
                  : props.statusClass === "executed"
                    ? "View results"
                    : "View proposal"}
            </span>
            <BendingChevron open={expanded} />
          </ActionButton>
        </div>
      </header>
      <div
        id={panelId}
        role="region"
        aria-labelledby={titleId}
        className="proposal-disclosure"
        data-open={expanded}
        aria-hidden={!expanded}
        ref={panelRef}
      >
        <div className="proposal-disclosure-clip">
          {hasOpened && (
            <div className="proposal-expanded-content">
              {props.details}
              <div className="proposal-expanded-footer">
                <Link href={props.href} className="ui-text-action" target="_blank" rel="noopener noreferrer">
                  Open full page ↗<span className="sr-only"> (opens in a new tab)</span>
                </Link>
                <ActionButton
                  type="button"
                  className="proposal-row-action"
                  onClick={collapse}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                >
                  <span>Close details</span>
                  <BendingChevron open={expanded} />
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** The compact right-hand state line: countdown while voting, then what the proposal is waiting on. */
export function rowTimingLabel(opts: {
  isActive: boolean;
  endMs: number;
  statusLabel: string;
  nowMs?: number;
}): string {
  const now = opts.nowMs ?? Date.now();
  if (opts.isActive && opts.endMs > now) return formatEndsIn(opts.endMs, now);
  if (opts.statusLabel === "Foundation Approval" || opts.statusLabel === "Veto period") {
    return "Awaiting Foundation approval";
  }
  // Voting closed but no verdict rendered yet (tally pending / stage not advanced).
  if (opts.endMs <= now && (opts.statusLabel === "Pending" || opts.statusLabel === "Active")) {
    return "Voting ended";
  }
  return opts.statusLabel;
}

export function capitalize(s?: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
