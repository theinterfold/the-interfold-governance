import { type CSSProperties, type ReactNode } from "react";
import { ProposalStatus } from "@aragon/ods";
import { ActionIcon } from "@/components/input/actionIcon";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { BallotPanel, ballotOptionColor } from "./ballot";

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
          <span className="pct" title={row.amount}>
            {row.percentage.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** A result is the voting body's outcome, not a claim that the SPP has executed the proposal. */
export function ResultPanel({
  rows,
  total,
  status,
  quorum,
  quorumNotMet = false,
  submitted = false,
  action,
  outcome: outcomeOverride,
  children,
}: {
  rows: ResultRow[];
  total: string;
  status?: ProposalStatus;
  quorum?: ResultQuorum | null;
  /** The status hook's authoritative flag, independent of the supply-derived `quorum` bar. */
  quorumNotMet?: boolean;
  submitted?: boolean;
  action?: ReactNode;
  /** Replaces the computed outcome line, e.g. the testnet "Quorum not met (X led with N%)" copy. */
  outcome?: ReactNode;
  children?: ReactNode;
}) {
  const noVotes = rows.every((row) => row.percentage === 0);
  const passed = [ProposalStatus.ACCEPTED, ProposalStatus.EXECUTABLE, ProposalStatus.EXECUTED].includes(status!);
  // Abstain contributes to quorum, not support. An accepted majority vote always approves Yes.
  const winner = passed && !noVotes ? rows.find((row) => row.index === 0) : undefined;
  const leader = rows.reduce<ResultRow | undefined>(
    (best, row) => (row.percentage > (best?.percentage ?? 0) ? row : best),
    undefined
  );
  const outcome = noVotes
    ? "No votes were cast"
    : quorumNotMet
      ? leader
        ? `Quorum not met (${leader.option} led with ${leader.percentage.toFixed(1)}% of votes cast)`
        : "Quorum not met"
      : quorum && !quorum.reached
        ? "Rejected — quorum not reached"
        : status === ProposalStatus.REJECTED
          ? "Rejected"
          : winner
            ? `Yes won with ${winner.percentage.toFixed(1)}%`
            : "Confirming result…";

  return (
    <BallotPanel title="Result" info={<span className="vp-meta">{total}</span>}>
      <FluidHeight>
        <div className="vp-body tally-body">
          <div className="tally-outcome ui-section-title" role="status">
            <span className={winner ? "tally-outcome-winner" : undefined}>
              {winner && (
                <span style={{ color: ballotOptionColor(winner.index) }}>
                  <ActionIcon name="check" />
                </span>
              )}
              <span>{outcomeOverride ?? outcome}</span>
            </span>
          </div>
          <ResultRows rows={rows} winnerIndex={winner?.index} />
          {quorum && (
            <div className="tally-row tally-quorum">
              <span className="key">Quorum {quorum.reached ? "✓" : ""}</span>
              <span className="bar" aria-hidden="true">
                <span
                  style={{
                    width: `${quorum.requiredPct > 0 ? Math.min((quorum.turnoutPct / quorum.requiredPct) * 100, 100) : 100}%`,
                    background: quorum.reached ? "var(--accent)" : "var(--muted)",
                  }}
                />
              </span>
              <span className="pct">
                {quorum.turnoutPct.toFixed(1)}% / {Number(quorum.requiredPct.toFixed(2))}%
              </span>
            </div>
          )}
          {submitted ? (
            <p className="vp-note tally-submitted">
              <ActionIcon name="check" /> Result submitted
            </p>
          ) : (
            action
          )}
          {children}
        </div>
      </FluidHeight>
    </BallotPanel>
  );
}
