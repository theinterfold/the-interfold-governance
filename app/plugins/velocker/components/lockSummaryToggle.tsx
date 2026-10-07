import { ActionButton } from "@/components/input/actionButton";
import { BendingChevron } from "@/vendor/site-header";
import { LOCK_STATUS_LABELS, LockStatusBadge, LockStatusIcon, type LockStatus } from "./lockStatusBadge";

export type LockSummaryItem = { id: string; status: LockStatus };

const states: LockStatus[] = ["active", "inactive", "cooldown", "ready"];

/** Grouped state badges split into the corresponding position badges on expansion. */
export function LockSummaryToggle({
  items,
  open,
  controls,
  onToggle,
}: {
  items: LockSummaryItem[];
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  if (!items.length) return null;
  const groups = states
    .map((status) => ({ status, count: items.filter((item) => item.status === status).length }))
    .filter(({ count }) => count > 0);
  const description = groups
    .map(({ status, count }) => `${count} ${LOCK_STATUS_LABELS[status].toLowerCase()}`)
    .join(", ");
  return (
    <ActionButton
      type="button"
      className="power-lock-summary power-lock-summary--states"
      aria-label={`${open ? "Hide" : "View"} locks: ${description}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className="power-lock-summary-layout" aria-hidden="true">
        <span className="power-lock-summary-heading">{open ? "Hide locks" : "View locks"}</span>
        <span className="power-lock-summary-states">
          {groups.map(({ status, count }) => (
            <LockStatusBadge status={status} data-motion-summary={status} key={status}>
              <LockStatusIcon status={status} />
              {count} {LOCK_STATUS_LABELS[status].toLowerCase()}
            </LockStatusBadge>
          ))}
        </span>
        <BendingChevron open={open} className="power-disclosure-chevron" />
      </span>
    </ActionButton>
  );
}
