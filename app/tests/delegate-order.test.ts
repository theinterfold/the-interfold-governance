import { describe, expect, test } from "bun:test";
import { firstDelegationBlocks, orderDelegates } from "../plugins/members/utils/delegateOrder";

const a = "0x00000000000000000000000000000000000000Aa" as const;
const b = "0x00000000000000000000000000000000000000Bb" as const;
const c = "0x00000000000000000000000000000000000000Cc" as const;

describe("Delegate directory ordering", () => {
  test("newest uses first received delegation, not subsequent activity or RPC order", () => {
    const blocks = firstDelegationBlocks([
      { args: { toDelegate: a }, blockNumber: 500n },
      { args: { toDelegate: b }, blockNumber: 300n },
      { args: { toDelegate: a.toLowerCase() as typeof a }, blockNumber: 100n },
      { args: { toDelegate: c }, blockNumber: null },
    ]);
    const entries = [a, c, b].map((address) => ({ address, votingPower: 1n }));
    expect(orderDelegates(entries, "newest", blocks).map((d) => d.address)).toEqual([b, a, c]);
  });

  test("power sorts preserve bigint precision and don't mutate the shared directory", () => {
    const entries = [
      { address: a, votingPower: 10n ** 24n },
      { address: b, votingPower: 10n ** 24n + 1n },
    ];
    expect(orderDelegates(entries, "power-desc").map((d) => d.address)).toEqual([b, a]);
    expect(orderDelegates(entries, "power-asc").map((d) => d.address)).toEqual([a, b]);
    expect(entries.map((d) => d.address)).toEqual([a, b]);
  });
});
