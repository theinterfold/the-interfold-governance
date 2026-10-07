import { useState } from "react";
import { formatUnits } from "viem";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { compactNumber, exactNumber } from "@/utils/numbers";
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
  includeVestingInLocked = false,
  showLegend = true,
  interactive = false,
}: {
  allocation: FoldAllocation;
  grouped?: boolean;
  includeVestingInLocked?: boolean;
  showLegend?: boolean;
  interactive?: boolean;
}) {
  const decimals = useTokenDecimals();
  const [hoveredKind, setHoveredKind] = useState<AllocationKind | FoldHoldingKind>();
  const [focusedKind, setFocusedKind] = useState<AllocationKind | FoldHoldingKind>();
  if (allocation.status !== "ready" || decimals === undefined)
    return (
      <p className="power-help" role="status">
        Balance breakdown unavailable.
      </p>
    );

  const parts = grouped ? foldHoldingParts(allocation.parts, { includeVestingInLocked }) : allocation.parts;
  let cumulative = 0n;
  const percentOf = (amount: bigint) =>
    allocation.total > 0n ? Number((amount * 1_000_000n) / allocation.total) / 10_000 : 0;
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
  const exact = (amount: bigint) => `${exactNumber(formatUnits(amount, decimals))} ${PUB_TOKEN_SYMBOL}`;
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
        <svg viewBox="0 0 160 160" role="img" aria-label={`${PUB_TOKEN_SYMBOL} allocation`}>
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
                  {labels[kind]}: {exact(amount)}
                </title>
              </circle>
            ))}
        </svg>
        <div className="fold-allocation-total">
          <span>Total {PUB_TOKEN_SYMBOL}</span>
          <strong className="ui-number" title={exact(allocation.total)}>
            {compact(allocation.total)}
          </strong>
        </div>
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
                <dt>
                  {interactive && amount > 0n ? (
                    <button
                      type="button"
                      className={styles.legendTarget}
                      aria-label={`${labels[kind]}: ${exact(amount)}. Highlight in balance chart.`}
                      onFocus={() => setFocusedKind(kind)}
                      onBlur={() => setFocusedKind(undefined)}
                      onClick={() => setFocusedKind(kind)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") event.currentTarget.blur();
                      }}
                    >
                      <span className="fold-allocation-dot" aria-hidden="true" />
                      {labels[kind]}
                    </button>
                  ) : (
                    <>
                      <span className="fold-allocation-dot" aria-hidden="true" />
                      {labels[kind]}
                    </>
                  )}
                </dt>
                <dd className="ui-number" title={exact(amount)}>
                  <span>{compact(amount)}</span>
                  <small>{grouped ? PUB_TOKEN_SYMBOL : percentage}</small>
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
