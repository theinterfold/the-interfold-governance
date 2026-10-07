import { useEffect, useRef, useState, type RefObject } from "react";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
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
  const taskFocus = useRef<HTMLSpanElement>(null);
  const keepFocus = useRef<HTMLSpanElement>(null);
  const keepTrigger = useRef<HTMLDivElement>(null);
  const returning = useRef(false);
  useEffect(() => setKeepLocked(false), [action]);
  const kind = keepLocked ? "cancel" : (action?.kind ?? "withdraw");
  const starting = kind === "start";
  const cancelling = kind === "cancel";
  const title = starting
    ? "Start withdrawal"
    : cancelling
      ? `Keep ${PUB_TOKEN_SYMBOL} locked`
      : `Withdraw ${PUB_TOKEN_SYMBOL}`;
  useEffect(() => {
    if (!action) return;
    const target = keepLocked
      ? keepFocus.current
      : returning.current
        ? keepTrigger.current?.querySelector("button")
        : taskFocus.current;
    target?.focus({ preventScroll: true });
    returning.current = false;
  }, [action, keepLocked]);
  const task = (taskKind: WithdrawalKind, focusRef: RefObject<HTMLSpanElement>) => {
    const begins = taskKind === "start";
    const cancels = taskKind === "cancel";
    return (
      <div className="power-tray-body">
        <span ref={focusRef} tabIndex={-1} className="sr-only">
          {begins ? "Start withdrawal" : cancels ? "Keep FOLD locked" : "Withdraw FOLD"}
        </span>
        <dl className="power-panel-facts">
          <div>
            <dt>{begins ? "Available to withdraw" : "After confirmation"}</dt>
            <dd>
              {begins
                ? cooldownDays === undefined
                  ? "After the cooldown"
                  : `After ${cooldownDays} days`
                : cancels
                  ? "Locked again"
                  : "Sent to your wallet"}
            </dd>
          </div>
          {begins && (
            <div>
              <dt>Voting power</dt>
              <dd>Stops immediately</dd>
            </div>
          )}
        </dl>
        <p className="power-tray-note">
          {begins
            ? `Your ${PUB_TOKEN_SYMBOL} stays in the contract during the cooldown. Return here when it ends to withdraw.`
            : cancels
              ? `Your ${PUB_TOKEN_SYMBOL} stays locked. You may need to delegate to yourself again to reactivate its voting power.`
              : `The cooldown has ended. This returns the ${PUB_TOKEN_SYMBOL} to your wallet.`}
        </p>
        {error && (
          <p className="power-field-error" role="alert">
            {error}
          </p>
        )}
        <WithdrawalButton
          kind={taskKind}
          intent="confirm"
          className="power-tray-confirm"
          isLoading={pending}
          onClick={() => onConfirm(taskKind)}
        >
          {begins
            ? "Confirm withdrawal request"
            : cancels
              ? `Keep ${PUB_TOKEN_SYMBOL} locked`
              : `Confirm ${PUB_TOKEN_SYMBOL} withdrawal`}
        </WithdrawalButton>
        {taskKind === "withdraw" && (
          <div ref={keepTrigger}>
            <WithdrawalButton kind="cancel" disabled={pending} onClick={() => setKeepLocked(true)}>
              Keep {PUB_TOKEN_SYMBOL} locked instead
            </WithdrawalButton>
          </div>
        )}
      </div>
    );
  };
  return (
    <ActionTray
      open={!!action}
      title={title}
      pending={pending}
      triggerRef={triggerRef}
      onClose={onClose}
      onBack={
        keepLocked
          ? () => {
              returning.current = true;
              setKeepLocked(false);
            }
          : undefined
      }
      backLabel="Back to withdrawal"
    >
      <FluidHeight layoutKey={kind}>
        <div className="power-tray-body">
          <div>
            <p className="power-label">Lock #{action?.tokenId.toString()}</p>
            <p className="power-tray-amount">
              {amount}
              <span>{PUB_TOKEN_SYMBOL}</span>
            </p>
          </div>
          <div className="motion-tab-panels">
            <MotionPanel active={!keepLocked} direction="left">
              {task(action?.kind ?? "withdraw", taskFocus)}
            </MotionPanel>
            <MotionPanel active={keepLocked} direction="right">
              {task("cancel", keepFocus)}
            </MotionPanel>
          </div>
        </div>
      </FluidHeight>
    </ActionTray>
  );
}
