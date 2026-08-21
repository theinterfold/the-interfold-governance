import Link from "next/link";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { AddressText } from "@/components/text/address";

export type RowBar = { width: number; color: string };

export interface ProposalRowProps {
  href: string;
  /** "Private" | "Public" — drives the editorial number column + tag. */
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
  /**
   * Filtered out by the active status filter. The row stays mounted (its hooks
   * are what resolve the status in the first place) but renders nothing.
   */
  hidden?: boolean;
}

/** Shared presentational row so private (CRISP) and public (TokenVoting) proposals render identically. */
export function ProposalRow(props: ProposalRowProps) {
  if (props.hidden) return null;

  if (props.loading) {
    return (
      <Link href={props.href} className="proposal-row">
        <div className="num">{props.kindLabel}</div>
        <div className="body">
          <PleaseWaitSpinner fullMessage={props.loadingMessage ?? "Loading…"} />
        </div>
        <div className="right" />
      </Link>
    );
  }

  return (
    <Link href={props.href} className="proposal-row">
      <div className="num">{props.kindLabel}</div>
      <div className="body">
        <div className="meta">
          {props.statusLabel && <span className={`badge ${props.statusClass ?? ""}`}>{props.statusLabel}</span>}
        </div>
        <h3>{props.title}</h3>
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
        {props.bars && props.bars.length > 0 && (
          <div className="mini-bar" aria-hidden="true">
            {props.bars.map((b, i) =>
              b.width > 0 ? <span key={i} style={{ width: `${b.width}%`, background: b.color }} /> : null
            )}
          </div>
        )}
      </div>
    </Link>
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
