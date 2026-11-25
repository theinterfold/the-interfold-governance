import { isAddress } from "viem";
import type { MaskEntry } from "../components/vote/maskQueue";

export type MaskRecipientGroup = { key: string; entry: MaskEntry; entries: MaskEntry[] };

/** Presentation only: never merge, reorder or resolve the underlying submissions. */
export function groupMaskRecipients(entries: readonly MaskEntry[]): MaskRecipientGroup[] {
  const groups = new Map<string, MaskRecipientGroup>();
  entries.forEach((entry, index) => {
    const address = entry.target.trim();
    const key = entry.mode === "random"
      ? "random"
      : isAddress(address)
        ? address.toLowerCase()
        : `incomplete:${index}`;
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else groups.set(key, { key, entry, entries: [entry] });
  });
  return Array.from(groups.values());
}
