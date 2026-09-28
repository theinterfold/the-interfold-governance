import { useEffect, useState, type RefObject } from "react";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { ActionTray } from "./actionTray";
import { WithdrawalButton, type WithdrawalKind } from "./withdrawalButton";

export type WithdrawalAction = { kind: WithdrawalKind; tokenId: bigint; amount: bigint };

type Props = {
  action?: WithdrawalAction;
  amount: string;
  cooldownDays?: number;
  pending: boolean;
  error?: string;
  triggerRef: RefObject<HTMLElement>;
  onClose: () => void;
  onConfirm: (kind: WithdrawalAction["kind"]) => void;
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
  const [keepLocked, setKeepLocked] = useState(false);
  useEffect(() => setKeepLocked(false), [action]);
  const kind = keepLocked ? "cancel" : (action?.kind ?? "withdraw");
  const starting = kind === "start";
  const cancelling = kind === "cancel";
  const title = starting
    ? "Start withdrawal"
    : cancelling
      ? `Keep ${PUB_TOKEN_SYMBOL} locked`
      : `Withdraw ${PUB_TOKEN_SYMBOL}`;
  return (
    <ActionTray
      open={!!action}
      title={title}
      pending={pending}
      triggerRef={triggerRef}
      onClose={onClose}
      onBack={keepLocked ? () => setKeepLocked(false) : undefined}
      backLabel="Back to withdrawal"
    >
      <FluidHeight>
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
          {error && (
            <p className="power-field-error" role="alert">
              {error}
            </p>
          )}
          <WithdrawalButton
            kind={kind}
            intent="confirm"
            className="power-tray-confirm"
            isLoading={pending}
            onClick={() => onConfirm(kind)}
          >
            {starting
              ? "Confirm withdrawal request"
              : cancelling
                ? `Keep ${PUB_TOKEN_SYMBOL} locked`
                : `Confirm ${PUB_TOKEN_SYMBOL} withdrawal`}
          </WithdrawalButton>
          {action?.kind === "withdraw" && !keepLocked && (
            <WithdrawalButton kind="cancel" disabled={pending} onClick={() => setKeepLocked(true)}>
              Keep {PUB_TOKEN_SYMBOL} locked instead
            </WithdrawalButton>
          )}
        </div>
      </FluidHeight>
    </ActionTray>
  );
}
