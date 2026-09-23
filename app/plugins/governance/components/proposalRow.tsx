import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { AddressText } from "@/components/text/address";
import { useInert } from "@/components/motion/useInert";

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
    <article ref={rowRef} className="proposal-item" data-expanded={expanded} hidden={props.hidden}>
      <header className="proposal-row">
        <div className="body">
          <div className="meta">
            {props.statusLabel && <span className={`badge ${props.statusClass ?? ""}`}>{props.statusLabel}</span>}
            <span className="proposal-method">{props.kindLabel}</span>
          </div>
          <h2 id={titleId}>
            <button
              ref={toggleRef}
              type="button"
              className="proposal-row-toggle"
              aria-expanded={expanded}
              aria-controls={panelId}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
              onClick={toggle}
            >
              {title}
            </button>
          </h2>
          <p className="summary line-clamp-2">{props.summary}</p>
          <div className="author">
            <em>By</em>
            <AddressText bold={false} asLink={false}>
              {props.creator}
            </AddressText>
          </div>
        </div>
        <div className="right">
          {props.rightLabel && <span className="time">{props.rightLabel}</span>}
          <div className="proposal-result">
            <span className="proposal-result-label">{props.resultLabel ?? "Voting results"}</span>
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
          <span className="proposal-row-action" aria-hidden="true">
            {expanded ? "Close details" : "View proposal"}
          </span>
        </div>
        <span className="proposal-expand-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 7h12" />
            <path className="proposal-expand-stem" d="M7 1v12" />
          </svg>
        </span>
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
                <Link href={props.href} target="_blank" rel="noopener noreferrer">
                  Open full page ↗
                </Link>
                <button type="button" onClick={collapse}>
                  Close details ↑
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** "Ends in 3h" / "Ends in 2d 4h" / "Ends in 12m" — the row's compact countdown. */
export function formatEndsIn(endMs: number, nowMs = Date.now()): string {
  const secs = Math.max(0, Math.floor((endMs - nowMs) / 1000));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `Ends in ${d}d${h ? ` ${h}h` : ""}`;
  if (h > 0) return `Ends in ${h}h${m ? ` ${m}m` : ""}`;
  return `Ends in ${Math.max(1, m)}m`;
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
