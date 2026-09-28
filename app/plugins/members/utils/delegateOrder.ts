import type { Address } from "viem";

export type DelegateOrder = "power-desc" | "power-asc" | "newest";
type Entry = { address: Address; votingPower: bigint };
type DelegationLog = { args: { toDelegate?: Address }; blockNumber: bigint | null };

/** First receipt of delegation, not the latest time someone changed their delegate. */
export function firstDelegationBlocks(logs: DelegationLog[]) {
  const blocks = new Map<string, bigint>();
  for (const log of logs) {
    if (!log.args.toDelegate || log.blockNumber === null) continue;
    const address = log.args.toDelegate.toLowerCase();
    const previous = blocks.get(address);
    if (previous === undefined || log.blockNumber < previous) blocks.set(address, log.blockNumber);
  }
  return blocks;
}

export function orderDelegates<T extends Entry>(
  entries: T[],
  order: DelegateOrder,
  firstSeen?: Map<string, bigint>
): T[] {
  return [...entries].sort((a, b) => {
    const x = order === "newest" ? firstSeen?.get(a.address.toLowerCase()) : a.votingPower;
    const y = order === "newest" ? firstSeen?.get(b.address.toLowerCase()) : b.votingPower;
    if (x === undefined && y !== undefined) return 1;
    if (y === undefined && x !== undefined) return -1;
    if (x !== undefined && y !== undefined && x !== y) {
      return (x > y ? -1 : 1) * (order === "power-asc" ? -1 : 1);
    }
    return a.address.toLowerCase().localeCompare(b.address.toLowerCase());
  });
}
