import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import {
  loadDelegateNames,
  isAddressSearch,
  matchesDelegateSearch,
  normalizeSearchName,
  selectableAddress,
} from "../plugins/members/utils/delegateSearch";

const address = "0xB8Adfee40e1DEfBB8314d3FeC3C622Be2F624901" as const;

describe("Delegate search", () => {
  test("matches partial names and addresses regardless of case or surrounding whitespace", () => {
    expect(matchesDelegateSearch(address, "  PRIVACY ", "web3privacynow.eth")).toBe(true);
    expect(matchesDelegateSearch(address, " b8ADf ")).toBe(true);
    expect(matchesDelegateSearch(address, "missing", "web3privacynow.eth")).toBe(false);
    expect(matchesDelegateSearch(address, " ")).toBe(true);
  });

  test("matches a forward-resolved name even if the wallet has a different primary name", () => {
    expect(matchesDelegateSearch(address, "other-name.eth", "primary.eth", address.toLowerCase() as Address)).toBe(
      true
    );
  });

  test("normalizes complete ENS names while rejecting invalid names and address-like input", () => {
    expect(normalizeSearchName("  AUSTINGRIFFITH.eth ")).toBe("austingriffith.eth");
    expect(normalizeSearchName("delegate.eth..eth")).toBeUndefined();
    expect(normalizeSearchName("0x1lucas.eth")).toBe("0x1lucas.eth");
    expect(isAddressSearch("0x1lucas")).toBe(false);
    expect(isAddressSearch("0x1abc")).toBe(true);
    expect(normalizeSearchName("austin")).toBeUndefined();
    expect(selectableAddress(address)).toBe(address);
    expect(selectableAddress("0x0000000000000000000000000000000000000000")).toBeUndefined();
    expect(selectableAddress("austingriffith.eth")).toBeUndefined();
    expect(selectableAddress("0x123")).toBeUndefined();
    expect(selectableAddress(null)).toBeUndefined();
  });

  test("indexes names beyond the first page with bounded requests, continuing past failed lookups", async () => {
    const addresses = Array.from(
      { length: 27 },
      (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}` as Address
    );
    const read: Address[] = [];
    const names = new Map<Address, string>();
    let active = 0;
    let peak = 0;
    await loadDelegateNames(
      addresses,
      async (wallet) => {
        read.push(wallet);
        peak = Math.max(peak, ++active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        if (wallet === addresses[0]) throw new Error("RPC unavailable");
        if (wallet === addresses[26]) names.set(wallet, "last-delegate.eth");
      },
      new AbortController().signal
    );
    expect(read).toHaveLength(27);
    expect(peak).toBeLessThanOrEqual(6);
    expect(addresses.filter((wallet) => matchesDelegateSearch(wallet, "last-delegate", names.get(wallet)))).toEqual([
      addresses[26],
    ]);
  });

  test("stops scheduling name lookups when the search is cancelled", async () => {
    const controller = new AbortController();
    let requests = 0;
    await loadDelegateNames(
      Array.from({ length: 30 }, () => address),
      async () => {
        requests++;
        controller.abort();
      },
      controller.signal
    );
    expect(requests).toBe(1);
  });
});
