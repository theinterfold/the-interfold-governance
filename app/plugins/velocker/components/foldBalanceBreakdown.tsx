import { useState } from "react";
import { Info } from "@phosphor-icons/react";
import { PowerInfo } from "./powerInfo";
import { formatUnits } from "viem";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { compactNumber, displayNumber } from "@/utils/numbers";
import {
  foldHoldingParts,
  type AllocationKind,
  type FoldAllocation,
  type FoldHoldingKind,
} from "../utils/foldAllocation";
import styles from "./foldBalanceBreakdown.module.css";

const labels: Record<AllocationKind | FoldHoldingKind, string> = {
  wallet: "Unlocked FOLD",
  locked: "Locked FOLD",
  delegated: "Delegated locks",
  self: "Self-delegated locks",
  undelegated: "Undelegated locks",
  cooldown: "In cooldown",
  ready: "Ready to withdraw",
  bonded: "Bonded",
  vesting: "Vesting",
};

/** The same ownership data powers the inline overview and the detailed balance tooltip. */
export function FoldBalanceBreakdown({
  allocation,
  grouped = false,
  showLegend = true,
  showTotal = true,
  interactive = false,
  distribution,
}: {
  allocation: FoldAllocation;
  grouped?: boolean;
  showLegend?: boolean;
  showTotal?: boolean;
  interactive?: boolean;
  /** Alternative composition using the same chart, legend and interaction. */
  distribution?: {
    total: bigint;
    label: string;
    parts: { kind: AllocationKind; amount: bigint; label: string }[];
  };
}) {
  const decimals = useTokenDecimals();
  const [hoveredKind, setHoveredKind] = useState<AllocationKind | FoldHoldingKind>();
  const [focusedKind, setFocusedKind] = useState<AllocationKind | FoldHoldingKind>();
  if ((!distribution && allocation.status !== "ready") || decimals === undefined)
    return (
      <p className="power-help" role="status">
        Breakdown unavailable.
      </p>
    );

  const allocationParts = allocation.status === "ready" ? allocation.parts : [];
  const parts = distribution?.parts ?? (grouped ? foldHoldingParts(allocationParts) : allocationParts);
  const total = distribution?.total ?? (allocation.status === "ready" ? allocation.total : 0n);
  const chartLabel = distribution?.label ?? `Total ${PUB_TOKEN_SYMBOL}`;
  const labelFor = (kind: AllocationKind | FoldHoldingKind) => distribution?.parts.find(part => part.kind === kind)?.label ?? labels[kind];
  const vesting = allocationParts.find(({ kind }) => kind === "vesting")?.amount ?? 0n;
  const readable = (amount: bigint) => `${displayNumber(formatUnits(amount, decimals))} ${PUB_TOKEN_SYMBOL}`;
  let cumulative = 0n;
  const percentOf = (amount: bigint) =>
    total > 0n ? Number((amount * 1_000_000n) / total) / 10_000 : 0;
  const segments = parts.map((part) => {
    const start = percentOf(cumulative);
    cumulative += part.amount;
    const percent = percentOf(cumulative) - start;
    return {
      ...part,
      start,
      percent,
      percentage: part.amount > 0n && percent < 0.01 ? "<0.01%" : `${percent.toFixed(2)}%`,
    };
  });
  const exact = (amount: bigint) => `${displayNumber(formatUnits(amount, decimals))} ${PUB_TOKEN_SYMBOL}`;
  const compact = (amount: bigint) => compactNumber(formatUnits(amount, decimals));
  const active = interactive
    ? segments.find(({ kind, amount }) => kind === (hoveredKind ?? focusedKind) && amount > 0n)
    : undefined;

  return (
    <div
      className={`fold-allocation${interactive ? ` ${styles.interactive}` : ""}`}
      data-detail={grouped ? "holdings" : "states"}
      data-highlighting={!!active}
    >
      <div className="fold-allocation-chart">
        <svg viewBox="0 0 160 160" role="img" aria-label={distribution ? chartLabel : `${PUB_TOKEN_SYMBOL} allocation`}>
          <circle className="fold-allocation-track" cx="80" cy="80" r="66" fill="none" strokeWidth="16" />
          {segments
            .filter(({ percent }) => percent > 0)
            .map(({ kind, amount, start, percent }) => (
              <circle
                key={kind}
                data-allocation={kind}
                data-highlighted={active?.kind === kind}
                onPointerEnter={interactive ? () => setHoveredKind(kind) : undefined}
                onPointerLeave={interactive ? () => setHoveredKind(undefined) : undefined}
                cx="80"
                cy="80"
                r="66"
                fill="none"
                strokeWidth="16"
                pathLength="100"
                strokeDasharray={`${percent} ${100 - percent}`}
                strokeDashoffset={-start}
                transform="rotate(-90 80 80)"
              >
                <title>
                  {labelFor(kind)}: {exact(amount)}
                </title>
              </circle>
            ))}
        </svg>
        {showTotal && <div className="fold-allocation-total">
          <span>{chartLabel}</span>
          <strong className="ui-number" title={exact(total)}>
            {compact(total)}
          </strong>
        </div>}
      </div>
      {showLegend &&
        (segments.length ? (
          <dl className="fold-allocation-legend">
            {segments.map(({ kind, amount, percentage }) => (
              <div
                key={kind}
                data-allocation={kind}
                data-highlighted={active?.kind === kind}
                onPointerEnter={interactive && amount > 0n ? () => setHoveredKind(kind) : undefined}
                onPointerLeave={interactive ? () => setHoveredKind(undefined) : undefined}
              >
                <dt onFocusCapture={() => setFocusedKind(kind)} onBlurCapture={() => setFocusedKind(undefined)}>
                  {grouped && kind === "locked" ? (
                    <PowerInfo
                      label="Locked FOLD breakdown"
                      compact={true}
                      trigger={<span className={styles.legendTarget}>
                        <span className="fold-allocation-dot" aria-hidden="true" />
                        {labelFor(kind)}
                        <Info size={16} aria-hidden="true" />
                      </span>}
                    >
                      <dl className="power-info-values">
                        <div><dt>Locks</dt><dd>{readable(amount - vesting)}</dd></div>
                        {vesting > 0n && <div><dt>Still vesting</dt><dd>{readable(vesting)}</dd></div>}
                      </dl>
                      <p>Locks include FOLD awaiting withdrawal.{vesting > 0n && " Vesting is separate from the locks listed below."}</p>
                    </PowerInfo>
                  ) : interactive && amount > 0n ? (
                    <button
                      type="button"
                      className={styles.legendTarget}
                      aria-label={`${labelFor(kind)}: ${exact(amount)}. Highlight in chart.`}
                      onFocus={() => setFocusedKind(kind)}
                      onBlur={() => setFocusedKind(undefined)}
                      onClick={() => setFocusedKind(kind)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") event.currentTarget.blur();
                      }}
                    >
                      <span className="fold-allocation-dot" aria-hidden="true" />
                      {labelFor(kind)}
                    </button>
                  ) : (
                    <>
                      <span className="fold-allocation-dot" aria-hidden="true" />
                      {labelFor(kind)}
                    </>
                  )}
                </dt>
                <dd className="ui-number" title={exact(amount)}>
                  <span>{compact(amount)}</span>
                  <small>{grouped || distribution ? PUB_TOKEN_SYMBOL : percentage}</small>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="power-help">No {PUB_TOKEN_SYMBOL} balance.</p>
        ))}
    </div>
  );
}
