import { useState, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { parseUnits } from "viem";
import { ActionButton } from "@/components/input/actionButton";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import {
  LockManagementSummary,
  FoldBalanceSummary,
  FoldHoldingsSummary,
} from "@/plugins/velocker/components/foldBalanceSummary";
import { VotingPowerInfo } from "@/plugins/velocker/components/votingPowerInfo";
import type { AllocationKind, FoldAllocation } from "@/plugins/velocker/utils/foldAllocation";
import { PowerDisclosure } from "@/plugins/velocker/components/powerDisclosure";
import {
  LOCK_STATUS_LABELS as stateLabels,
  LockStatusBadge,
  LockStatusIcon,
  type LockStatus,
} from "@/plugins/velocker/components/lockStatusBadge";
import { PowerInfoArrow } from "@/plugins/velocker/components/powerInfoArrow";
import { BendingChevron } from "@/vendor/site-header";
import { compactNumber } from "@/utils/numbers";
import styles from "@/dev/lockBarReview.module.css";

export type PreviewLock = {
  id: string;
  amount: number;
  status: LockStatus;
  days?: number;
  cooldown?: { endsAt: number; observedAt: number };
};
export type Variant = "a" | "b" | "c" | "d";
export type BalanceLayout = "original" | "inline" | "paired" | "hierarchy";
export type StateTreatment = "reference" | "icons" | "bubbles" | "badges";
export const states = Object.keys(stateLabels) as LockStatus[];

export const amount = (value: number) => compactNumber(String(value));
const key = (lock: PreviewLock) => `lock-${lock.id}`;

export function LockReviewPanel({
  locks,
  variant,
  layout,
  stateTreatment,
  unlockedAmount = 2500,
  selfDelegatedAmount = 0,
  lockAction,
}: {
  locks: PreviewLock[];
  variant: Variant;
  layout: BalanceLayout;
  stateTreatment: StateTreatment;
  unlockedAmount?: number;
  selfDelegatedAmount?: number;
  lockAction?: ReactNode;
}) {
  const decimals = useTokenDecimals();
  const [feedback, setFeedback] = useState("");
  const tokens = (value: number) => (decimals === undefined ? undefined : parseUnits(String(value), decimals));
  const locked = tokens(locks.reduce((sum, lock) => sum + lock.amount, 0));
  const unlocked = tokens(unlockedAmount);
  const bonded = tokens(10000);
  const vesting = tokens(15000);
  const allocationStates: Record<LockStatus, AllocationKind> = {
    active: "delegated",
    inactive: "undelegated",
    cooldown: "cooldown",
    ready: "ready",
  };
  const parts: { kind: AllocationKind; amount: bigint }[] =
    decimals === undefined
      ? []
      : ([
          { kind: "wallet", amount: unlocked! },
          ...states.map((status) => ({
            kind: allocationStates[status],
            amount: tokens(locks.filter((lock) => lock.status === status).reduce((sum, lock) => sum + lock.amount, 0))!,
          })),
          { kind: "bonded", amount: bonded! },
          { kind: "vesting", amount: vesting! },
        ].filter((part) => part.amount > 0n) as { kind: AllocationKind; amount: bigint }[]);
  const allocation: FoldAllocation =
    decimals === undefined
      ? { status: "unavailable" }
      : {
          status: "ready",
          parts,
          total: parts.reduce((sum, part) => sum + part.amount, 0n),
        };
  const createAction = lockAction ?? (
    <ActionButton
      intent="create"
      affordance="lock"
      onClick={() => setFeedback("Nesta comparação, Lock FOLD é apenas uma prévia.")}
    >
      Lock FOLD
    </ActionButton>
  );
  return (
    <>
      <div
        className={`power-card power-overview-card ${styles.fullPanel}`}
        data-balance-layout={variant === "b" ? layout : "original"}
        data-state-treatment={stateTreatment}
      >
        <div className="power-account-summary">
          <div className="power-total-summary">
            <dl className="power-metric-total" aria-label="Your voting power">
              <dt>
                Voting power
                <VotingPowerInfo
                  breakdown={{ available: true, lockedAndDelegated: tokens(selfDelegatedAmount), bonded, vesting }}
                />
              </dt>
              <dd>
                {amount(25000 + selfDelegatedAmount)}
                <span>FOLD</span>
              </dd>
            </dl>
          </div>
          <FoldHoldingsSummary allocation={allocation} />
        </div>
        <PowerDisclosure
          className="power-lock-disclosure"
          title="Locked FOLD"
          renderHeading={(toggle) =>
            variant === "b" && layout === "hierarchy" ? (
              <LockManagementSummary
                locked={locked}
                unlocked={unlocked}
                createAction={createAction}
                detailAction={locks.length > 0 ? toggle : undefined}
              />
            ) : (
              <FoldBalanceSummary
                locked={locked}
                unlocked={unlocked}
                lockedAction={toggle}
                unlockedAction={createAction}
              />
            )
          }
          renderToggle={(props) => (
            <PreviewBar {...props} variant={variant} locks={locks} layout={layout} stateTreatment={stateTreatment} />
          )}
        >
          <PreviewRows locks={locks} showIcons={stateTreatment !== "reference"} />
        </PowerDisclosure>
      </div>
      <p role="status" className={styles.previewFeedback}>
        {feedback}
      </p>
    </>
  );
}

export function PreviewRows({ locks, showIcons = false }: { locks: PreviewLock[]; showIcons?: boolean }) {
  return locks.length ? (
    <ul className={styles.rows}>
      {locks.map((lock) => (
        <li key={lock.id}>
          <span className={styles.lockId}>#{lock.id}</span>
          <span className={styles.rowAmount}>
            {amount(lock.amount)} <span>FOLD</span>
          </span>
          <span className={styles.rowState}>
            <LockStatusBadge
              status={lock.status}
              cooldown={lock.cooldown}
              data-motion-item={key(lock)}
              data-motion-group={lock.status}
            >
              {showIcons && <StateIcon status={lock.status} inheritColor={true} />}
              {stateLabels[lock.status]}
            </LockStatusBadge>
          </span>
        </li>
      ))}
    </ul>
  ) : null;
}

export function PreviewBar({
  variant,
  locks,
  open,
  controls,
  onToggle,
  layout = "original",
  stateTreatment = "reference",
}: {
  variant: Variant;
  locks: PreviewLock[];
  open: boolean;
  controls: string;
  onToggle: () => void;
  layout?: BalanceLayout;
  stateTreatment?: StateTreatment;
}) {
  if (!locks.length) return null;
  const groups = states
    .map((status) => ({
      status,
      locks: locks.filter((lock) => lock.status === status),
    }))
    .filter((group) => group.locks.length);
  const total = locks.reduce((sum, lock) => sum + lock.amount, 0);
  const previewIds = new Set(groups.map((group) => group.locks[0].id));
  for (const lock of locks) {
    if (previewIds.size >= 4) break;
    previewIds.add(lock.id);
  }
  const remaining = locks.length - previewIds.size;
  const lockCount = `${locks.length} ${locks.length === 1 ? "lock" : "locks"}`;
  const description = groups
    .map(
      (group) =>
        `${group.locks.length} ${stateLabels[group.status].toLowerCase()}, ${amount(group.locks.reduce((sum, lock) => sum + lock.amount, 0))} FOLD`
    )
    .join(", ");
  const button = (
    <ActionButton
      className={`power-lock-summary ${styles.bar}`}
      data-variant={variant}
      data-layout={variant === "b" ? layout : "original"}
      aria-label={`${open ? "Hide" : "View"} ${lockCount}${description ? `: ${description}` : ""}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className={styles.barLayout} aria-hidden="true">
        <span className={styles.barHeading}>
          {open ? "Hide locks" : variant === "b" ? "View locks" : `View ${lockCount}`}
        </span>
        {variant === "a" && (
          <span className={styles.markers}>
            {locks
              .filter((lock) => previewIds.has(lock.id))
              .map((lock) => (
                <span
                  className="power-lock-marker"
                  data-status={lock.status}
                  data-motion-summary={key(lock)}
                  key={lock.id}
                />
              ))}
            {remaining > 0 && (
              <span data-motion-summary="overflow" className={styles.overflow}>
                +{remaining}
              </span>
            )}
          </span>
        )}
        <BendingChevron open={open} className={`power-disclosure-chevron ${styles.chevron}`} />
        {variant === "b" && (
          <span className={styles.counts}>
            {groups.map((group) =>
              stateTreatment === "badges" ? (
                <LockStatusBadge status={group.status} data-motion-summary={group.status} key={group.status}>
                  <StateIcon status={group.status} inheritColor={true} />
                  {group.locks.length} {stateLabels[group.status].toLowerCase()}
                </LockStatusBadge>
              ) : (
                <span className={styles.count} key={group.status}>
                  {stateTreatment === "bubbles" ? (
                    <LockStatusBadge
                      status={group.status}
                      className={styles.stateBubble}
                      data-motion-summary={group.status}
                    >
                      <StateIcon status={group.status} inheritColor={true} />
                    </LockStatusBadge>
                  ) : (
                    <StateIcon status={group.status} summary={true} />
                  )}
                  <span>
                    {group.locks.length} {stateLabels[group.status].toLowerCase()}
                  </span>
                </span>
              )
            )}
          </span>
        )}
        {variant === "c" && (
          <span className={styles.amountPreview}>
            <span className={styles.amountGroups}>
              {groups.map((group) => (
                <span className={styles.amountGroup} key={group.status}>
                  <span className={styles.stateLabel}>
                    <span className="power-lock-marker" data-status={group.status} data-motion-summary={group.status} />
                    {stateLabels[group.status]}
                  </span>
                  <span>
                    {amount(group.locks.reduce((sum, lock) => sum + lock.amount, 0))}{" "}
                    <span className={styles.unit}>FOLD</span>
                  </span>
                </span>
              ))}
            </span>
            <span className={styles.track}>
              {groups.map((group) => (
                <span
                  key={group.status}
                  data-status={group.status}
                  style={{ flexGrow: group.locks.reduce((sum, lock) => sum + lock.amount, 0) / (total || 1) }}
                />
              ))}
            </span>
          </span>
        )}
        {variant === "d" && (
          <span className={styles.positions}>
            {locks.slice(0, 2).map((lock) => (
              <span className={styles.position} key={lock.id}>
                <span className={styles.lockId}>#{lock.id}</span>
                <span>
                  {amount(lock.amount)} <span className={styles.unit}>FOLD</span>
                </span>
                <span className={styles.positionState}>
                  <span className="power-lock-marker" data-status={lock.status} data-motion-summary={key(lock)} />
                  {stateLabels[lock.status]}
                </span>
              </span>
            ))}
            {locks.length > 2 && (
              <span className={styles.more} data-motion-summary="overflow">
                +{locks.length - 2} more {locks.length === 3 ? "lock" : "locks"}
              </span>
            )}
          </span>
        )}
      </span>
    </ActionButton>
  );
  if (variant !== "a") return button;
  return (
    <Tooltip.Provider delayDuration={180}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild={true}>{button}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="power-info-popover power-info-popover--compact"
            side="top"
            sideOffset={8}
            collisionPadding={16}
          >
            <div className={styles.legend}>
              {groups.length
                ? groups.map((group) => (
                    <span key={group.status}>
                      <span className="power-lock-marker" data-status={group.status} />
                      <span>
                        {group.locks.length} {stateLabels[group.status].toLowerCase()}
                      </span>
                      <span>{amount(group.locks.reduce((sum, lock) => sum + lock.amount, 0))} FOLD</span>
                    </span>
                  ))
                : "No locks yet"}
            </div>
            <Tooltip.Arrow asChild={true} className="power-info-arrow" width={14} height={7}>
              <PowerInfoArrow />
            </Tooltip.Arrow>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function StateIcon({
  status,
  summary = false,
  inheritColor = false,
}: {
  status: LockStatus;
  summary?: boolean;
  inheritColor?: boolean;
}) {
  return (
    <span
      className={`${styles.stateIcon} ${inheritColor ? styles.inheritStateColor : ""}`}
      data-status={status}
      data-motion-summary={summary ? status : undefined}
      aria-hidden="true"
    >
      <LockStatusIcon status={status} />
    </span>
  );
}
