import { PanelHeader } from "@/components/panelHeader";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { ListTokenAmount, RowIdentifier } from "@/components/text/listValue";
import type { ReactNode } from "react";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { PleaseWaitSpinner } from "@/components/please-wait";
import type { useVeLocks } from "../hooks/useVeLocks";
import type { WithdrawalAction } from "./withdrawalDialog";
import { WithdrawalButton } from "./withdrawalButton";
import { LockStatusBadge } from "./lockStatusBadge";
import styles from "./accountPanels.module.css";

type Props = {
  locks: Pick<ReturnType<typeof useVeLocks>, "ownedLocks" | "queuedExits" | "isLoading" | "error">;
  delegationLabel: ReactNode;
  createAction: ReactNode;
  busy: boolean;
  compact: (value?: bigint) => string;
  openWithdrawal: (action: WithdrawalAction, trigger: HTMLElement) => void;
  description?: string;
  headingPlacement?: "inside" | "outside";
};

/** Always-visible positions retain their live withdrawal and delegation state. */
export function YourLocks({
  locks,
  delegationLabel,
  createAction,
  busy,
  compact,
  openWithdrawal,
  description,
  headingPlacement = "inside",
}: Props) {
  const lockCount = locks.ownedLocks.length + locks.queuedExits.length;
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
      className={styles.locksHeading}
    />
  );
  const card = (
    <ScrollFadeIn
      as="section"
      amount="some"
      className={`power-card ${styles.locksCard}`}
      data-heading-outside={headingPlacement === "outside" || undefined}
      aria-labelledby="account-locks-heading"
    >
      {headingPlacement === "inside" && heading}
      {feedback}
      {available && lockCount === 0 && <p className={styles.empty}>No locks yet.</p>}
      {available && lockCount > 0 && (
        <>
          <div className="power-position-list power-lock-position-list" role="table" aria-label="Your FOLD locks">
            <div className="power-position-head ui-table-head sr-only" role="row">
              <span role="columnheader">
                <span className="sr-only">Lock ID</span>
              </span>
              <span role="columnheader">Amount and delegate</span>
              <span role="columnheader" className="power-position-status">
                Status
              </span>
              <span role="columnheader" className="power-position-action">
                <span className="sr-only">Action</span>
              </span>
            </div>
            {locks.ownedLocks.map((lock) => (
              <div className="power-position-row" role="row" key={lock.tokenId.toString()}>
                <div className="power-position-id" role="cell">
                  <RowIdentifier>#{lock.tokenId.toString()}</RowIdentifier>
                </div>
                <div className="power-position-holding" role="cell">
                  <div className="power-position-amount">
                    <ListTokenAmount value={compact(lock.amount)} symbol={PUB_TOKEN_SYMBOL} />
                  </div>
                  <div className="power-position-delegate">
                    {lock.delegated ? (
                      <>
                        <span>Delegated to </span>
                        {delegationLabel}
                      </>
                    ) : (
                      "No voting delegate"
                    )}
                  </div>
                </div>
                <div className="power-position-status" role="cell">
                  <LockStatusBadge
                    status={lock.delegated ? "active" : "inactive"}
                    data-motion-item={`lock-${lock.tokenId}`}
                    data-motion-group={lock.delegated ? "active" : "inactive"}
                  />
                </div>
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
            {locks.queuedExits.map((ticket) => (
              <div className="power-position-row" role="row" key={ticket.tokenId.toString()}>
                <div className="power-position-id" role="cell">
                  <RowIdentifier>#{ticket.tokenId.toString()}</RowIdentifier>
                </div>
                <div className="power-position-holding" role="cell">
                  <div className="power-position-amount">
                    <ListTokenAmount value={compact(ticket.amount)} symbol={PUB_TOKEN_SYMBOL} />
                  </div>
                  <div className="power-position-delegate">No voting power</div>
                </div>
                <div className="power-position-status" role="cell">
                  <LockStatusBadge
                    status={ticket.canExit ? "ready" : "cooldown"}
                    cooldown={
                      ticket.canExit
                        ? undefined
                        : { endsAt: ticket.exitDate, observedAt: Math.floor(Date.now() / 1000) }
                    }
                    data-motion-item={`lock-${ticket.tokenId}`}
                    data-motion-group={ticket.canExit ? "ready" : "cooldown"}
                  />
                </div>
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
        </>
      )}
    </ScrollFadeIn>
  );
  return headingPlacement === "outside" ? (
    <div>
      {heading}
      {card}
    </div>
  ) : (
    card
  );
}
