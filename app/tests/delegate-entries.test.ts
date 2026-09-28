import { describe, expect, test } from "bun:test";
import { includeConnectedWallet } from "../plugins/members/utils/delegateEntries";
import { orderDelegates } from "../plugins/members/utils/delegateOrder";

const wallet = "0x00000000000000000000000000000000000000Aa" as const;
const delegate = "0x00000000000000000000000000000000000000Bb" as const;

describe("Connected wallet in the delegate directory", () => {
  test("includes an undiscovered wallet, even with zero power, in the normal sort", () => {
    const snapshot = [{ address: delegate, votingPower: 10n }];
    const entries = includeConnectedWallet(snapshot, wallet, 0n);
    expect(orderDelegates(entries, "power-asc").map((entry) => entry.address)).toEqual([wallet, delegate]);
    expect(orderDelegates(entries, "power-desc").map((entry) => entry.address)).toEqual([delegate, wallet]);
    expect(snapshot).toHaveLength(1);
  });

  test("uses current power without duplicating an indexed wallet with different casing", () => {
    const snapshot = [
      { address: wallet.toLowerCase() as typeof wallet, votingPower: 20n },
      { address: delegate, votingPower: 10n },
    ];
    const entries = includeConnectedWallet(snapshot, wallet, 5n);
    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.address === wallet)?.votingPower).toBe(5n);
    expect(orderDelegates(entries, "power-desc")[0].address).toBe(delegate);
    expect(snapshot[0].votingPower).toBe(20n);
  });

  test("does not invent a zero balance while the wallet read is unavailable or disconnected", () => {
    const snapshot = [{ address: wallet, votingPower: 20n }];
    expect(includeConnectedWallet(snapshot, wallet, undefined)).toEqual(snapshot);
    expect(includeConnectedWallet(snapshot, undefined, 0n)).toEqual(snapshot);
  });
});
