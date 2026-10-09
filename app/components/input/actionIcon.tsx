import {
  ArrowCounterClockwise,
  CaretRight,
  Check,
  Clock,
  LockSimple,
  Minus,
  PaperPlaneTilt,
  Plus,
  Trash,
  Wallet,
  X,
} from "@phosphor-icons/react";

const icons = {
  plus: Plus,
  next: CaretRight,
  lock: LockSimple,
  remove: Minus,
  discard: Trash,
  close: X,
  clock: Clock,
  undo: ArrowCounterClockwise,
  wallet: Wallet,
  check: Check,
  send: PaperPlaneTilt,
};

export type ActionIconName = keyof typeof icons;

/** One size and stroke family for action affordances and their completed states. */
export function ActionIcon({ name }: { name: ActionIconName }) {
  const Icon = icons[name];
  return <Icon className="ui-action-icon" size={16} weight="regular" aria-hidden="true" />;
}
