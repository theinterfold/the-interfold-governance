import { describe, expect, test } from "bun:test";
import { getAddress } from "viem";
import { groupMaskRecipients } from "../plugins/crispVoting/utils/maskRecipientGroups";
import type { MaskEntry } from "../plugins/crispVoting/components/vote/maskQueue";

describe("Grouped mask review", () => {
  test("groups repeated wallets regardless of casing without merging or reordering submissions", () => {
    const address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const entries: MaskEntry[] = [
      { id: 1, mode: "address", target: address },
      { id: 2, mode: "address", target: `0x${"2".repeat(40)}` },
      { id: 3, mode: "address", target: ` ${getAddress(address)} ` },
    ];
    const before = structuredClone(entries);
    const groups = groupMaskRecipients(entries);
    expect(groups.map((group) => group.entries.map((entry) => entry.id))).toEqual([[1, 3], [2]]);
    expect(groups.reduce((count, group) => count + group.entries.length, 0)).toBe(3);
    expect(entries).toEqual(before);
  });

  test("random placeholders share a count without claiming a known wallet", () => {
    const groups = groupMaskRecipients([
      { id: 0, mode: "random", target: "" },
      { id: 1, mode: "address", target: `0x${"1".repeat(40)}` },
      { id: 2, mode: "random", target: "" },
      { id: 3, mode: "random", target: "" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].entry.mode).toBe("random");
    expect(groups[0].entries).toHaveLength(3);
    expect(groups[0].entries.every((entry) => entry.target === "")).toBe(true);
    expect(groups[1].entry.mode).toBe("address");
  });

  test("does not hide separate incomplete recipients inside a group", () => {
    expect(groupMaskRecipients([
      { id: 0, mode: "address", target: "" },
      { id: 1, mode: "address", target: "" },
      { id: 2, mode: "address", target: "invalid" },
    ])).toHaveLength(3);
    expect(groupMaskRecipients([])).toEqual([]);
  });
});
