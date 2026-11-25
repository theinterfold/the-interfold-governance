import {
  Check, Checks, Clock, HourglassLow, Info, Minus, PlayCircle, Prohibit, Pulse,
  ShieldCheck, WarningCircle, XCircle, type Icon,
} from "@phosphor-icons/react";
import { StatusBadge } from "@/components/text/statusBadge";

const icons = new Map<string, Icon>([
  ["pending", Clock], ["unreached", Clock], ["loading", Clock], ["skipped", Minus],
  ["active", Pulse], ["foundation", ShieldCheck],
  ["accepted", Check], ["executable", PlayCircle], ["executed", Checks],
  ["expired", HourglassLow], ["canceled", Prohibit], ["vetoed", Prohibit],
  ["failed", WarningCircle], ["rejected", XCircle],
]);

// The staged resolver groups these outcomes under "failed" for presentation.
const terminalStates = new Map<string, string>([
  ["Canceled", "canceled"], ["Vetoed", "vetoed"], ["Rejected", "rejected"], ["Quorum not met", "rejected"],
]);

export function ProposalStatusBadge({ state, label, ...props }: {
  state?: string;
  label: string;
  "data-proposal-part"?: string;
}) {
  const variant = terminalStates.get(label) ?? state ?? "";
  const Glyph = icons.get(variant) ?? Info;
  return (
    <StatusBadge {...props} className={`proposal-status ${variant}`}
      icon={<Glyph size={14} weight="bold" aria-hidden="true" focusable="false" />}>
      {label}
    </StatusBadge>
  );
}
