import type { HTMLAttributes } from "react";
import { StatusBadge } from "@/components/text/statusBadge";
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
  ...props
}: HTMLAttributes<HTMLSpanElement> & { status: LockStatus }) {
  return (
    <StatusBadge {...props} className={`lock-status-badge ${colors[status]} ${className}`} data-status={status}>
      {children ?? (
        <>
          <LockStatusIcon status={status} />
          {LOCK_STATUS_LABELS[status]}
        </>
      )}
    </StatusBadge>
  );
}
