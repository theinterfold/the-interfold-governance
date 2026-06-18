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
}

/** Shared presentational row so private (CRISP) and public (TokenVoting) proposals render identically. */
export function ProposalRow(props: ProposalRowProps) {
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
          <AddressText bold={false}>{props.creator}</AddressText>
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

export function capitalize(s?: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
