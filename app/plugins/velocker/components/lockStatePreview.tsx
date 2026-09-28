import { LockStatusBadge, type LockStatus } from "./lockStatusBadge";
import { WithdrawalButton } from "./withdrawalButton";
import type { WithdrawalAction } from "./withdrawalDialog";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { PowerInfo } from "./powerInfo";

type PreviewLock = { tokenId: bigint; amount: bigint; detail: string };

/** The collapsed counts expose the same positions and dates as the full list. */
export function LockStatePreview({
  status,
  label,
  locks,
  fmt,
  disabled,
  busy,
  openWithdrawal,
}: {
  status: LockStatus;
  label: string;
  locks: PreviewLock[];
  fmt: (value?: bigint) => string;
  disabled: boolean;
  busy: boolean;
  openWithdrawal: (action: WithdrawalAction, trigger: HTMLElement) => void;
}) {
  if (!locks.length) return null;
  const countLabel = `${locks.length} ${label}`;
  return (
    <PowerInfo
      interactive={true}
      label={`Preview ${countLabel}`}
      disabled={disabled}
      contentClassName="lock-state-preview"
      trigger={
        <LockStatusBadge status={status} data-motion-summary={status}>
          {countLabel}
        </LockStatusBadge>
      }
    >
      <ul className="lock-state-preview-list" aria-label={countLabel}>
        {locks.map((lock) => (
          <li key={lock.tokenId.toString()}>
            <span className="lock-state-preview-id">#{lock.tokenId.toString()}</span>
            <span>
              <strong>{fmt(lock.amount)}</strong>
              <span className="lock-state-preview-detail">{lock.detail}</span>
            </span>
            <WithdrawalButton
              kind={status === "ready" ? "withdraw" : status === "cooldown" ? "cancel" : "start"}
              disabled={busy}
              aria-haspopup="dialog"
              onClick={(event) =>
                openWithdrawal(
                  {
                    kind: status === "ready" ? "withdraw" : status === "cooldown" ? "cancel" : "start",
                    tokenId: lock.tokenId,
                    amount: lock.amount,
                  },
                  event.currentTarget
                )
              }
            >
              {status === "ready"
                ? `Withdraw ${PUB_TOKEN_SYMBOL}`
                : status === "cooldown"
                  ? "Cancel withdrawal"
                  : "Start withdrawal"}
            </WithdrawalButton>
          </li>
        ))}
      </ul>
      {locks.length > 1 && (
        <dl className="lock-state-preview-total">
          <dt>Total</dt>
          <dd>{fmt(locks.reduce((total, lock) => total + lock.amount, 0n))}</dd>
        </dl>
      )}
    </PowerInfo>
  );
}
