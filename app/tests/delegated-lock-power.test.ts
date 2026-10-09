import { describe, expect, test } from "bun:test";
import { zeroAddress } from "viem";
import { delegatedLockTokens } from "../plugins/velocker/utils/delegatedLockPower";

const owner = "0x000000000000000000000000000000000000De01";
const other = "0x000000000000000000000000000000000000De02";

describe("Delegated tokens", () => {
  const locks = [
    { delegated: true, amount: 15n },
    { delegated: true, amount: 10n },
    { delegated: false, amount: 100n },
  ];

  test("self-delegation shows the same token amount as an existing delegation to another wallet", () => {
    expect(delegatedLockTokens(owner, locks)).toBe(25n);
    expect(delegatedLockTokens(other, locks)).toBe(25n);
    expect(delegatedLockTokens("0x000000000000000000000000000000000000de01", locks)).toBe(25n);
  });

  test("unknown reads remain unknown; unactivated or empty delegation is zero", () => {
    expect(delegatedLockTokens(undefined, locks)).toBeUndefined();
    expect(delegatedLockTokens(owner)).toBeUndefined();
    expect(delegatedLockTokens(zeroAddress, locks)).toBe(0n);
    expect(delegatedLockTokens(owner, [])).toBe(0n);
    expect(delegatedLockTokens(owner, [{ delegated: false, amount: 100n }])).toBe(0n);
  });
});
