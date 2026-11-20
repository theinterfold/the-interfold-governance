import type { HTMLAttributes } from "react";
import { StatusBadge } from "@/components/text/statusBadge";
import { DeadlineInfo } from "@/components/text/deadlineInfo";
import { CooldownTime } from "./cooldownTime";
import { PowerInfo } from "./powerInfo";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { Check, Hourglass, LinkBreak, LockSimple } from "@phosphor-icons/react";

export type LockStatus = "active" | "inactive" | "cooldown" | "ready";
export const LOCK_STATUS_LABELS: Record<LockStatus, string> = {
  active: "Active",
  inactive: "Not delegated",
  cooldown: "In cooldown",
  ready: "Ready to withdraw",
};
const icons = { active: LockSimple, inactive: LinkBreak, cooldown: Hourglass, ready: Check };
const colors: Record<LockStatus, string> = {
  active: "active",
  inactive: "unreached",
  cooldown: "lock-cooldown",
  ready: "lock-ready",
};

export function LockStatusIcon({ status }: { status: LockStatus }) {
  const Icon = icons[status];
  return <Icon className="lock-status-icon" size={16} weight="regular" aria-hidden="true" focusable="false" />;
}

export function LockStatusBadge({
  status,
  children,
  className = "",
  cooldown,
  showWithdrawalInfo = false,
  responsive = false,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  status: LockStatus;
  cooldown?: { endsAt: number; observedAt: number };
  /** Position rows own their help; summary badges may already be inside a control. */
  showWithdrawalInfo?: boolean;
  responsive?: boolean;
}) {
  const badge = (
    <StatusBadge {...props} className={`lock-status-badge ${colors[status]} ${className}`} data-status={status}
      responsive={responsive ? {
        label: LOCK_STATUS_LABELS[status],
        short: status === "cooldown" && cooldown ? <CooldownTime {...cooldown} compact /> : status === "ready" ? "Ready" : status === "inactive" ? "Inactive" : "Active",
        icon: <LockStatusIcon status={status} />,
      } : undefined}>
      {children ?? (
        <>
          <LockStatusIcon status={status} />
          {LOCK_STATUS_LABELS[status]}
        </>
      )}
      {status === "cooldown" && cooldown && <CooldownTime {...cooldown} />}
    </StatusBadge>
  );
  return status === "cooldown" && cooldown ? (
    <span className="power-cooldown-status">
      <DeadlineInfo label="Cooldown ends" atMs={cooldown.endsAt * 1000}
        description={showWithdrawalInfo ? `This ${PUB_TOKEN_SYMBOL} is not included in your voting power. You can withdraw it once the cooldown ends.` : undefined}>
        {badge}
      </DeadlineInfo>
    </span>
  ) : status === "ready" && showWithdrawalInfo ? (
    <PowerInfo compact label="Ready to withdraw: voting power" trigger={badge}>
      <p>This {PUB_TOKEN_SYMBOL} is ready to withdraw and is not included in your voting power.</p>
    </PowerInfo>
  ) : responsive && status === "inactive" ? (
    <PowerInfo compact label="Not delegated: voting power" trigger={badge}>
      <p>This lock has not been delegated and is not included in voting power.</p>
    </PowerInfo>
  ) : (
    badge
  );
}
