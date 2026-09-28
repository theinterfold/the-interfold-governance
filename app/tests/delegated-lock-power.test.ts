import { describe, expect, test } from "bun:test";
import { zeroAddress } from "viem";
import { delegatedLockPower, delegatedLockTokens } from "../plugins/velocker/utils/delegatedLockPower";

const owner = "0x000000000000000000000000000000000000De01";
const other = "0x000000000000000000000000000000000000De02";

describe("Power delegated to others", () => {
  test("self-delegation, including different address casing, sends no power to others", () => {
    expect(delegatedLockPower(owner, "0x000000000000000000000000000000000000de01")).toBe(0n);
    expect(delegatedLockPower(owner, zeroAddress)).toBe(0n);
  });

  test("only activated owned locks contribute, using their actual voting power", () => {
    expect(
      delegatedLockPower(owner, other, [
        { delegated: true, votingPower: 15n },
        { delegated: true, votingPower: 10n },
        { delegated: false, votingPower: 100n },
      ])
    ).toBe(25n);
  });

  test("unresolved delegation or locks are unknown, not zero", () => {
    expect(delegatedLockPower(owner, undefined, [])).toBeUndefined();
    expect(delegatedLockPower(owner, other)).toBeUndefined();
    expect(delegatedLockPower(undefined, other, [])).toBeUndefined();
  });

  test("a resolved wallet with no owned active locks has no outgoing power", () => {
    expect(delegatedLockPower(owner, other, [])).toBe(0n);
  });
});

describe("Delegated tokens", () => {
  const locks = [
    { delegated: true, amount: 15n, votingPower: 12n },
    { delegated: true, amount: 10n, votingPower: 8n },
    { delegated: false, amount: 100n, votingPower: 100n },
  ];

  test("self-delegation shows the same token amount as delegating to another wallet", () => {
    expect(delegatedLockTokens(owner, locks)).toBe(25n);
    expect(delegatedLockTokens(other, locks)).toBe(25n);
    expect(delegatedLockTokens("0x000000000000000000000000000000000000de01", locks)).toBe(25n);
    // The outgoing-vote metric used elsewhere must still exclude self-delegation.
    expect(delegatedLockPower(owner, owner, locks)).toBe(0n);
    expect(delegatedLockPower(owner, other, locks)).toBe(20n);
  });

  test("unknown reads remain unknown; unactivated or empty delegation is zero", () => {
    expect(delegatedLockTokens(undefined, locks)).toBeUndefined();
    expect(delegatedLockTokens(owner)).toBeUndefined();
    expect(delegatedLockTokens(zeroAddress, locks)).toBe(0n);
    expect(delegatedLockTokens(owner, [])).toBe(0n);
    expect(delegatedLockTokens(owner, [{ delegated: false, amount: 100n }])).toBe(0n);
  });
});
