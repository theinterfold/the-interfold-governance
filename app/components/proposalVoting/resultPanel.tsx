import { type CSSProperties, type ReactNode } from "react";
import { ProposalStatus } from "@aragon/ods";
import { ActionIcon } from "@/components/input/actionIcon";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { BallotPanel, ballotOptionColor } from "./ballot";
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
    <div className="tally-rows" role="list" aria-label="Vote share">
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

/** One hierarchy for pending, failed and tallied results, in both voting methods. */
export function ResultFrame({
  state = "Voting closed",
  title,
  description,
  children,
}: {
  state?: ReactNode;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <BallotPanel className={styles.panel} title="Result" info={<span className="vp-meta">{state}</span>}>
      <FluidHeight layoutKey={title}>
        <div className={`vp-body ${styles.body}`}>
          <div className={styles.summary} aria-live="polite">
            <h4 className={styles.outcome}>
              <span key={title} className="vp-label-change">
                {title}
              </span>
            </h4>
            {description && <div className={styles.description}>{description}</div>}
          </div>
          {children}
        </div>
      </FluidHeight>
    </BallotPanel>
  );
}

export function ResultNotice({ state, title, children }: { state: ReactNode; title: string; children: ReactNode }) {
  return <ResultFrame state={state} title={title} description={children} />;
}

/** A result is the voting body's outcome, not a claim that the SPP has executed the proposal. */
export function ResultPanel({
  rows,
  total,
  status,
  quorum,
  quorumNotMet = false,
  submitted = false,
  isEmpty = false,
  action,
  children,
}: {
  rows: ResultRow[];
  total: string;
  status?: ProposalStatus;
  quorum?: ResultQuorum | null;
  /** The status hook's authoritative flag, independent of the supply-derived `quorum` bar. */
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
  const yes = rows.find((row) => row.index === 0);
  const outcome = !resolved
    ? "Confirming result"
    : noVotes
      ? "No votes cast"
      : lowQuorum || status === ProposalStatus.REJECTED
        ? "Vote rejected"
        : "Vote passed";
  const explanation = !resolved
    ? "The final voting outcome is not confirmed yet."
    : noVotes
      ? "No votes were cast. This proposal did not pass."
      : lowQuorum
        ? `Quorum not reached. Participation was below the required minimum.${
            quorumNotMet && leading
              ? ` ${leading.option} led with ${leading.percentage.toFixed(1)}% of the voting power cast.`
              : ""
          }`
        : status === ProposalStatus.REJECTED
          ? quorum
            ? "The required support was not reached."
            : "The vote did not meet the approval requirements."
          : yes
            ? `Yes received ${yes.percentage.toFixed(1)}% of the voting power cast.`
            : undefined;

  return (
    <ResultFrame title={outcome} description={<p>{explanation}</p>}>
      <div className={styles.tally}>
        <div className={styles.fact}>
          <span>Voting power cast</span>
          <strong>{total}</strong>
        </div>
        <ResultRows rows={rows} winnerIndex={leading?.index} />
        {quorum && (
          <div className="tally-row tally-quorum">
            <span className="key">Quorum {resolved && quorum.reached ? "✓" : ""}</span>
            <span className="bar" aria-hidden="true">
              <span
                style={{
                  width: `${quorum.requiredPct > 0 ? Math.min((quorum.turnoutPct / quorum.requiredPct) * 100, 100) : 100}%`,
                  background: resolved && quorum.reached ? "var(--accent)" : "var(--muted)",
                }}
              />
            </span>
            <span className="pct">
              {quorum.turnoutPct.toFixed(1)}% / {Number(quorum.requiredPct.toFixed(2))}%
            </span>
          </div>
        )}
      </div>
      {submitted ? (
        <p className={styles.submitted}>
          <ActionIcon name="check" /> Result submitted to the next stage
        </p>
      ) : (
        action
      )}
      {children}
    </ResultFrame>
  );
}
