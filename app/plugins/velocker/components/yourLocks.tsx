import { StatusBadge } from "@/components/text/statusBadge";
import { RecordTable, useRecordTable } from "@/components/recordTable";
import { LockedRecordStatus } from "@/components/recordStatus";
import { PanelHeader } from "@/components/panelHeader";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { ListTokenAmount, RowIdentifier } from "@/components/text/listValue";
import type { ReactNode } from "react";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { PleaseWaitSpinner } from "@/components/please-wait";
import type { useVeLocks } from "../hooks/useVeLocks";
import type { WithdrawalAction } from "./withdrawalDialog";
import { WithdrawalButton } from "./withdrawalButton";
import { LockStatusBadge, LockStatusIcon, LOCK_STATUS_LABELS } from "./lockStatusBadge";
import styles from "./accountPanels.module.css";

type Props = {
  locks: Pick<ReturnType<typeof useVeLocks>, "ownedLocks" | "queuedExits" | "isLoading" | "error">;
  delegationLabel: ReactNode;
  showDelegation?: boolean;
  showActiveStatus?: boolean;
  showWithdrawalsSummary?: boolean;
  createAction: ReactNode;
  votingStatus?: ReactNode;
  busy: boolean;
  compact: (value?: bigint) => string;
  openWithdrawal: (action: WithdrawalAction, trigger: HTMLElement) => void;
  description?: string;
  headingPlacement?: "inside" | "outside";
  section?: "all" | "active" | "withdrawals";
};

/** Always-visible positions retain their live withdrawal and delegation state. */
export function YourLocks({
  locks,
  delegationLabel,
  showDelegation = true,
  showActiveStatus = true,
  showWithdrawalsSummary = true,
  createAction,
  votingStatus,
  busy,
  compact,
  openWithdrawal,
  description,
  headingPlacement = "inside",
  section = "all",
}: Props) {
  const { embedded, presentation: tableLayout } = useRecordTable();
  const LockPanel = tableLayout || embedded ? "section" : ScrollFadeIn;
  const showStatus = tableLayout || showActiveStatus || locks.ownedLocks.some(lock => !lock.delegated);
  const lockCount = locks.ownedLocks.length + locks.queuedExits.length;
  const withdrawingAmount = locks.queuedExits.reduce((total, ticket) => total + ticket.amount, 0n);
  const available = !locks.isLoading && !locks.error;
  const feedback = locks.isLoading ? (
    <div role="status" aria-label="Loading locks">
      <PleaseWaitSpinner />
    </div>
  ) : locks.error ? (
    <p className="power-feedback" role="alert">
      {locks.error}
    </p>
  ) : undefined;
  const heading = (
    <PanelHeader
      id="account-locks-heading"
      title="Your locks"
      description={description}
      action={createAction}
      animate={!tableLayout && !embedded}
      className={styles.locksHeading}
    />
  );
  const card = (
    <LockPanel
      {...(LockPanel === ScrollFadeIn ? {as:"section" as const, amount:"some" as const} : {})}
      data-record-group
      className={`power-card ${styles.locksCard}`}
      data-heading-outside={headingPlacement === "outside" || undefined}
      data-voting-status={!!votingStatus || undefined}
      aria-labelledby={embedded ? undefined : "account-locks-heading"}
      aria-label={embedded ? "Active locks" : undefined}
    >
      {!tableLayout && !embedded && headingPlacement === "inside" && heading}
      {feedback}
      {available && votingStatus && <div className={styles.lockVotingStatus}>{votingStatus}</div>}
      {available && lockCount === 0 && <p className={styles.empty}>No locks yet.</p>}
      {available && locks.ownedLocks.length > 0 && (
        <>
          <div className="power-position-list power-lock-position-list" role="table" aria-label="Your FOLD locks" data-show-status={showStatus}>
            <div className="power-position-head ui-table-head sr-only" role="row">
              <span role="columnheader">
                <span className="sr-only">Lock ID</span>
              </span>
              <span role="columnheader">{showDelegation ? "Amount and delegate" : "Amount"}</span>
              {showStatus && <span role="columnheader" className="power-position-status">
                Status
              </span>}
              <span role="columnheader" className="power-position-action">
                <span className="sr-only">Action</span>
              </span>
            </div>
            {locks.ownedLocks.map((lock) => (
              <div className="power-position-row" role="row" key={lock.tokenId.toString()}>
                <LockIdentity enabled={tableLayout}>
                  <div className="power-position-id" role="cell">
                    <RowIdentifier>#{lock.tokenId.toString()}</RowIdentifier>
                  </div>
                  <div className="power-position-holding" role="cell">
                    <div className="power-position-amount">
                      {tableLayout && <StatusBadge data-record-position-icon className={lock.delegated ? "accepted" : "unreached"}><LockStatusIcon status={lock.delegated ? "active" : "inactive"} /></StatusBadge>}
                      <ListTokenAmount value={compact(lock.amount)} symbol={PUB_TOKEN_SYMBOL} />
                    </div>
                    {showDelegation && <div className="power-position-delegate">
                      {lock.delegated ? (
                        <>
                          <span>Delegated to </span>
                          {delegationLabel}
                        </>
                      ) : (
                        "No voting delegate"
                      )}
                    </div>}
                  </div>
                  {showStatus && <div className="power-position-status" role="cell">
                    {tableLayout && lock.delegated ? <LockedRecordStatus data-motion-item={`lock-${lock.tokenId}`} data-motion-group="active" /> : <LockStatusBadge
                      responsive={tableLayout}
                      children={tableLayout ? LOCK_STATUS_LABELS.inactive : undefined}
                      status={lock.delegated ? "active" : "inactive"}
                      data-motion-item={`lock-${lock.tokenId}`}
                      data-motion-group={lock.delegated ? "active" : "inactive"}
                    />}
                  </div>}
                </LockIdentity>
                <div className="power-position-action" role="cell">
                  <WithdrawalButton
                    size="compact"
                    kind="start"
                    aria-haspopup="dialog"
                    disabled={busy}
                    onClick={(event) =>
                      openWithdrawal({ kind: "start", tokenId: lock.tokenId, amount: lock.amount }, event.currentTarget)
                    }
                  >
                    Start withdrawal
                  </WithdrawalButton>
                </div>
              </div>
            ))}

          </div>
        </>
      )}
    </LockPanel>
  );
  const withdrawalsCard = available && locks.queuedExits.length > 0 ? (
    <LockPanel {...(LockPanel === ScrollFadeIn ? {as:"section" as const, amount:"some" as const} : {})} data-record-group className={`power-card ${styles.locksCard} ${styles.withdrawalCard}`} aria-label="Withdrawals — excluded from voting power">
      {!tableLayout && showWithdrawalsSummary && <div className={styles.withdrawalHeading}>
        <div className={styles.withdrawalTitle}>
          <h3>Withdrawals</h3>
          <ListTokenAmount value={compact(withdrawingAmount)} symbol={PUB_TOKEN_SYMBOL} />
        </div>
        <p>Not included in voting power</p>
      </div>}
      <div className="power-position-list power-lock-position-list" role="table" aria-label="Your withdrawals">
        <div role="row" className="sr-only">
          <span role="columnheader">Lock ID</span>
          <span role="columnheader">Amount</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Action</span>
        </div>
            {locks.queuedExits.map((ticket) => (
              <div className="power-position-row" role="row" key={ticket.tokenId.toString()}>
                <LockIdentity enabled={tableLayout}>
                  <div className="power-position-id" role="cell">
                    <RowIdentifier>#{ticket.tokenId.toString()}</RowIdentifier>
                  </div>
                  <div className="power-position-holding" role="cell">
                    <div className="power-position-amount">
                      {tableLayout && <StatusBadge data-record-position-icon className={ticket.canExit ? "lock-ready" : "lock-cooldown"}><LockStatusIcon status={ticket.canExit ? "ready" : "cooldown"} /></StatusBadge>}
                      <ListTokenAmount value={compact(ticket.amount)} symbol={PUB_TOKEN_SYMBOL} />
                    </div>
                  </div>
                  <div className="power-position-status" role="cell">
                    <LockStatusBadge
                      responsive={tableLayout}
                      status={ticket.canExit ? "ready" : "cooldown"}
                      children={tableLayout ? LOCK_STATUS_LABELS[ticket.canExit ? "ready" : "cooldown"] : undefined}
                      showWithdrawalInfo={true}
                      cooldown={
                        ticket.canExit
                          ? undefined
                          : { endsAt: ticket.exitDate, observedAt: Math.floor(Date.now() / 1000) }
                      }
                      data-motion-item={`lock-${ticket.tokenId}`}
                      data-motion-group={ticket.canExit ? "ready" : "cooldown"}
                    />
                  </div>
                </LockIdentity>
                <div className="power-position-action" role="cell">
                  <WithdrawalButton
                    size="compact"
                    kind={ticket.canExit ? "withdraw" : "cancel"}
                    aria-haspopup="dialog"
                    disabled={busy}
                    onClick={(event) =>
                      openWithdrawal(
                        {
                          kind: ticket.canExit ? "withdraw" : "cancel",
                          tokenId: ticket.tokenId,
                          amount: ticket.amount,
                        },
                        event.currentTarget
                      )
                    }
                  >
                    {ticket.canExit ? `Withdraw ${PUB_TOKEN_SYMBOL}` : "Cancel withdrawal"}
                  </WithdrawalButton>
                </div>
              </div>
            ))}

      </div>
    </LockPanel>
  ) : null;
  const showLockCard = !available || locks.ownedLocks.length > 0 || locks.queuedExits.length === 0;
  if (tableLayout && embedded) return <>
    {section !== "withdrawals" && showLockCard && card}
    {section !== "active" && withdrawalsCard}
  </>;
  if (tableLayout && !embedded) return <RecordTable kind="locks" heading={heading}>
    {section !== "withdrawals" && showLockCard && card}
    {section !== "active" && withdrawalsCard}
  </RecordTable>;
  return <div>
    {!embedded && (headingPlacement === "outside" || !showLockCard) && heading}
    <div className={styles.lockGroups}>
      {section !== "withdrawals" && showLockCard && card}
      {section !== "active" && withdrawalsCard}
    </div>
  </div>;
}

/** Preserve legacy table cells; group identity and status only in record tables. */
function LockIdentity({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <div className="power-position-summary" role="presentation">{children}</div> : <>{children}</>;
}
