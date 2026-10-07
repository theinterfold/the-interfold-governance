import { ActionIcon } from "@/components/input/actionIcon";

/** A current delegation is a status, not an unavailable action. */
export function DelegateStatus() {
  return (
    <span className="delegate-status">
      Delegated
      <ActionIcon name="check" />
    </span>
  );
}
