import type { RefObject } from "react";
import { Disclosure } from "@/components/motion/Disclosure";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { ActionTray } from "./actionTray";
import { PowerAction } from "./powerAction";

export type WithdrawalAction = { kind: "start" | "withdraw" | "cancel"; tokenId: bigint; amount: bigint };

type Props = {
  action?: WithdrawalAction;
  amount: string;
  cooldownDays?: number;
  pending: boolean;
  error?: string;
  triggerRef: RefObject<HTMLElement>;
  onClose: () => void;
  onConfirm: () => void;
};

export function WithdrawalDialog({
  action,
  amount,
  cooldownDays,
  pending,
  error,
  triggerRef,
  onClose,
  onConfirm,
}: Props) {
  const starting = action?.kind === "start";
  const cancelling = action?.kind === "cancel";
  const title = starting ? "Start withdrawal" : cancelling ? "Cancel withdrawal" : `Withdraw ${PUB_TOKEN_SYMBOL}`;
  return (
    <ActionTray open={!!action} title={title} pending={pending} triggerRef={triggerRef} onClose={onClose}>
      <div className="power-tray-body">
        <div>
          <p className="power-label">Lock #{action?.tokenId.toString()}</p>
          <p className="power-tray-amount">
            {amount}
            <span>{PUB_TOKEN_SYMBOL}</span>
          </p>
        </div>
        <dl className="power-panel-facts">
          <div>
            <dt>{starting ? "Available to withdraw" : "After confirmation"}</dt>
            <dd>
              {starting
                ? cooldownDays === undefined
                  ? "After the cooldown"
                  : `After ${cooldownDays} days`
                : cancelling
                  ? "Locked again"
                  : "Sent to your wallet"}
            </dd>
          </div>
          {starting && (
            <div>
              <dt>Voting power</dt>
              <dd>Stops immediately</dd>
            </div>
          )}
        </dl>
        <p className="power-tray-note">
          {starting
            ? `Your ${PUB_TOKEN_SYMBOL} stays in the contract during the cooldown. Return here when it ends to withdraw.`
            : cancelling
              ? `Your ${PUB_TOKEN_SYMBOL} stays locked. You may need to delegate again to reactivate its voting power.`
              : `The cooldown has ended. This returns the ${PUB_TOKEN_SYMBOL} to your wallet.`}
        </p>
        <PowerAction intent="confirm" size="lg" className="power-tray-confirm" isLoading={pending} onClick={onConfirm}>
          {starting
            ? "Confirm withdrawal request"
            : cancelling
              ? `Keep ${PUB_TOKEN_SYMBOL} locked`
              : `Confirm ${PUB_TOKEN_SYMBOL} withdrawal`}
        </PowerAction>
        <div aria-live="polite">
          <Disclosure open={!!error}>
            <p className="power-field-error">{error}</p>
          </Disclosure>
        </div>
      </div>
    </ActionTray>
  );
}
