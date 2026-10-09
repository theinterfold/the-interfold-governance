import type { ReactNode } from "react";
import { formatUnits } from "viem";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { compactNumber, exactNumber } from "@/utils/numbers";
import type { FoldAllocation } from "../utils/foldAllocation";
import { FoldBalanceInfo } from "./foldBalanceInfo";
import { FoldBalanceBreakdown } from "./foldBalanceBreakdown";
import { PowerInfo } from "./powerInfo";

/** One balance per category: the wide chart uses the actionable balances as its legend. */
export function FoldAccountSummary({
  votingPower,
  allocation,
  locked,
  unlocked,
  createAction,
  detailAction,
}: {
  votingPower: ReactNode;
  allocation: FoldAllocation;
  locked?: bigint;
  unlocked?: bigint;
  createAction: ReactNode;
  detailAction?: ReactNode;
}) {
  const part = (kind: "bonded" | "vesting") =>
    allocation.status === "ready" ? (allocation.parts.find((value) => value.kind === kind)?.amount ?? 0n) : undefined;
  return (
    <div className="fold-account-summary fold-allocation">
      <div className="fold-account-voting">{votingPower}</div>
      <div className="fold-account-total">
        <div className="fold-holdings-compact">
          <FoldBalanceMetric
            label={`Total ${PUB_TOKEN_SYMBOL}`}
            value={allocation.status === "ready" ? allocation.total : undefined}
            kind="total"
            info={<FoldBalanceInfo allocation={allocation} />}
          />
        </div>
        <div className="fold-holdings-expanded">
          <FoldBalanceBreakdown allocation={allocation} grouped={true} showLegend={false} />
        </div>
      </div>
      <div className="fold-account-locked">
        <FoldBalanceMetric
          label={`Locked ${PUB_TOKEN_SYMBOL}`}
          value={locked}
          kind="locked"
          marker={true}
          info={
            <PowerInfo label="About locked FOLD" compact={true}>
              <p>FOLD in governance locks, including locks in cooldown or ready to withdraw.</p>
              <p>Bonded and vesting FOLD are accounted for separately.</p>
            </PowerInfo>
          }
        />
      </div>
      <div className="fold-account-bonded">
        <FoldBalanceMetric label="Bonded" value={part("bonded")} kind="bonded" marker={true} />
      </div>
      <div className="fold-account-vesting">
        <FoldBalanceMetric label="Vesting" value={part("vesting")} kind="vesting" marker={true} />
      </div>
      <div className="fold-account-unlocked">
        <FoldBalanceMetric label={`Unlocked ${PUB_TOKEN_SYMBOL}`} value={unlocked} kind="unlocked" marker={true} />
        {createAction}
      </div>
      {detailAction && <div className="fold-account-detail">{detailAction}</div>}
    </div>
  );
}

/** Lock management pairs each balance with its action. */
export function FoldBalanceSummary({
  locked,
  unlocked,
  lockedAction,
  unlockedAction,
}: {
  locked?: bigint;
  unlocked?: bigint;
  lockedAction: ReactNode;
  unlockedAction: ReactNode;
}) {
  const category = (label: string, value: bigint | undefined, kind: string, info?: ReactNode, action?: ReactNode) => {
    return (
      <div className="fold-balance-category" data-category={kind}>
        <FoldBalanceMetric label={label} value={value} kind={kind} info={info} />
        {action && <div className="fold-balance-action">{action}</div>}
      </div>
    );
  };

  return (
    <div className="fold-balance-categories" role="group" aria-label="Locked and unlocked FOLD">
      {category(`Unlocked ${PUB_TOKEN_SYMBOL}`, unlocked, "unlocked", undefined, unlockedAction)}
      {category(
        `Locked ${PUB_TOKEN_SYMBOL}`,
        locked,
        "locked",
        <PowerInfo label="About locked FOLD" compact={true}>
          <p>FOLD in governance locks, including locks in cooldown or ready to withdraw.</p>
          <p>Bonded and vesting FOLD are accounted for separately.</p>
        </PowerInfo>,
        lockedAction
      )}
    </div>
  );
}

/** Current position, available balance and its action, followed by the lock detail. */
export function LockManagementSummary({
  locked,
  unlocked,
  createAction,
  detailAction,
}: {
  locked?: bigint;
  unlocked?: bigint;
  createAction: ReactNode;
  detailAction?: ReactNode;
}) {
  return (
    <div className="power-lock-management" role="group" aria-label="FOLD balances and lock management">
      <div className="power-lock-management-position">
        <FoldBalanceMetric
          label={`Locked ${PUB_TOKEN_SYMBOL}`}
          value={locked}
          kind="locked"
          info={
            <PowerInfo label="About locked FOLD" compact={true}>
              <p>FOLD in governance locks, including locks in cooldown or ready to withdraw.</p>
              <p>Bonded and vesting FOLD are accounted for separately.</p>
            </PowerInfo>
          }
        />
      </div>
      <div className="power-lock-management-available" role="group" aria-label="Lock unlocked FOLD">
        <FoldBalanceMetric label={`Unlocked ${PUB_TOKEN_SYMBOL}`} value={unlocked} kind="unlocked" />
        {createAction}
      </div>
      {detailAction && <div className="power-lock-management-detail">{detailAction}</div>}
    </div>
  );
}

/** Wide layouts expose every holding; compact layouts keep the breakdown available on demand. */
export function FoldHoldingsSummary({ allocation }: { allocation: FoldAllocation }) {
  return (
    <div className="fold-holdings-summary" role="group" aria-label="FOLD holdings">
      <div className="fold-holdings-compact">
        <FoldBalanceMetric
          label={`Total ${PUB_TOKEN_SYMBOL}`}
          value={allocation.status === "ready" ? allocation.total : undefined}
          kind="total"
          info={<FoldBalanceInfo allocation={allocation} />}
        />
      </div>
      <div className="fold-holdings-expanded">
        <FoldBalanceBreakdown allocation={allocation} grouped={true} />
      </div>
    </div>
  );
}

export function FoldBalanceMetric({
  label,
  value,
  kind,
  info,
  marker = false,
}: {
  label: string;
  value?: bigint;
  kind: string;
  info?: ReactNode;
  marker?: boolean;
}) {
  const decimals = useTokenDecimals();
  const amount = value === undefined || decimals === undefined ? undefined : formatUnits(value, decimals);
  return (
    <dl
      className={`fold-balance-metric fold-balance-${kind}`}
      data-balance={kind}
      data-allocation={kind === "unlocked" ? "wallet" : kind}
    >
      <dt>
        {marker && <span className="fold-account-marker fold-allocation-dot" aria-hidden="true" />}
        {label}
        {info}
      </dt>
      <dd title={amount === undefined ? undefined : `${exactNumber(amount)} ${PUB_TOKEN_SYMBOL}`}>
        {amount === undefined ? "-" : compactNumber(amount)} <span>{PUB_TOKEN_SYMBOL}</span>
      </dd>
    </dl>
  );
}
