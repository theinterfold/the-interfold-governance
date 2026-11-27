import { type CSSProperties, type ReactNode } from "react";
import { Check, Clock, Info, Pulse, WarningCircle, XCircle } from "@phosphor-icons/react";
import { ProposalStatus } from "@aragon/ods";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { BallotPanel, ballotOptionColor } from "./ballot";
import { StatusBadge } from "@/components/text/statusBadge";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import styles from "./resultPanel.module.css";

export interface ResultRow {
  option: string;
  index: number;
  percentage: number;
  amount: string;
}

export interface ResultQuorum {
  reached: boolean;
  turnoutPct: number;
  requiredPct: number;
}

export function formatResultAmount(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 0 : 4 });
}

/** Both backends keep their own units; this only computes shares from like-for-like counts. */
export function resultPercentages(values: bigint[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0n);
  return values.map((value) => (total > 0n ? Number((value * 100_000n) / total) / 1000 : 0));
}

/** The same rows also show public live tallies, without declaring a winner early. */
export function ResultRows({ rows, winnerIndex }: { rows: ResultRow[]; winnerIndex?: number }) {
  return (
    <div className={`tally-rows ${styles.rows}`} role="list" aria-label="Vote share">
      {rows.map((row) => (
        <div
          key={row.index}
          role="listitem"
          className="tally-row"
          data-leading={row.index === winnerIndex || undefined}
          style={{ "--tally-color": ballotOptionColor(row.index) } as CSSProperties}
        >
          <span className="key">
            <span className="swatch" style={{ background: "var(--tally-color)" }} aria-hidden="true" />
            <span className="truncate">{row.option}</span>
          </span>
          <span className="bar" aria-hidden="true">
            <span
              style={{ width: `${Math.min(100, Math.max(row.percentage, 0))}%`, background: "var(--tally-color)" }}
            />
          </span>
          <span className="pct">
            <PowerInfo
              compact={true}
              label={`${row.option}: ${row.amount}, ${row.percentage.toFixed(1)}% of voting power cast`}
              trigger={<span>{row.percentage.toFixed(1)}%</span>}
            >
              <p>
                {row.option}: {row.amount}
              </p>
              <p>{row.percentage.toFixed(1)}% of the voting power cast.</p>
            </PowerInfo>
          </span>
        </div>
      ))}
    </div>
  );
}

type ResultTone = "passed" | "rejected" | "warning" | "failed" | "pending" | "active" | "neutral";
const resultIcons = { passed: Check, rejected: XCircle, warning: WarningCircle, failed: WarningCircle, pending: Clock, active: Pulse, neutral: Info };

/** One hierarchy for pending, failed and tallied results, in both voting methods. */
export function ResultFrame({
  tone = "pending",
  title,
  description,
  children,
}: {
  tone?: ResultTone;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  const Glyph = resultIcons[tone];
  return (
    <BallotPanel
      className={styles.panel}
      heading={
        <h3 aria-live="polite">
          <StatusBadge
            className={`${tone} ${styles.status}`}
            data-result-tone={tone}
            icon={<Glyph size={14} weight="bold" aria-hidden="true" focusable="false" />}
          >
            <span key={title} className="vp-label-change">{title}</span>
          </StatusBadge>
        </h3>
      }
    >
      <FluidHeight layoutKey={title}>
        <div className={`vp-body ${styles.body}`}>
          {description && <div className={styles.description}>{description}</div>}
          {children}
        </div>
      </FluidHeight>
    </BallotPanel>
  );
}

export function ResultNotice({ tone, title, children }: { tone?: ResultTone; title: string; children: ReactNode }) {
  return <ResultFrame tone={tone} title={title} description={children} />;
}

/** A result is the voting body's outcome, not a claim that the SPP has executed the proposal. */
export function ResultPanel({
  rows,
  status,
  quorum,
  quorumNotMet = false,
  submitted = false,
  isEmpty = false,
  action,
  children,
}: {
  rows: ResultRow[];
  status?: ProposalStatus;
  quorum?: ResultQuorum | null;
  /** The status hook's authoritative flag, independent of the supply-derived quorum. */
  quorumNotMet?: boolean;
  submitted?: boolean;
  /** Explicit zero raw tally; rounded shares and missing rows cannot establish zero votes. */
  isEmpty?: boolean;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const passed = [ProposalStatus.ACCEPTED, ProposalStatus.EXECUTABLE, ProposalStatus.EXECUTED].includes(status!);
  const resolved = rows.length > 0 && (passed || status === ProposalStatus.REJECTED);
  const noVotes = resolved && status === ProposalStatus.REJECTED && isEmpty;
  const lowQuorum =
    resolved && status === ProposalStatus.REJECTED && (quorumNotMet || (quorum != null && !quorum.reached));
  const largestShare = Math.max(0, ...rows.map((row) => row.percentage));
  const leaders = rows.filter((row) => row.percentage === largestShare);
  const leading = resolved && !noVotes && largestShare > 0 && leaders.length === 1 ? leaders[0] : undefined;
  const outcome = !resolved
    ? "Confirming result"
    : noVotes
      ? "No votes cast"
      : lowQuorum
        ? "Quorum not met"
        : status === ProposalStatus.REJECTED
          ? "Vote rejected"
          : "Vote passed";

  return (
    <ResultFrame
      title={outcome}
      tone={!resolved ? "pending" : noVotes || lowQuorum ? "warning" : passed ? "passed" : "rejected"}
    >
      <div className={styles.tally}>
        <ResultRows rows={rows} winnerIndex={leading?.index} />
      </div>
      {!submitted && action}
      {children}
    </ResultFrame>
  );
}
