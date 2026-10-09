import { describe, expect, test } from "bun:test";
import { zeroAddress, type Address } from "viem";
import { foldAllocation, foldHoldingParts, unvestedBalance } from "../plugins/velocker/utils/foldAllocation";

const account = "0x00000000000000000000000000000000000000aa" as Address;
const delegate = "0x00000000000000000000000000000000000000bb" as Address;
const lock = (tokenId: bigint, amount: bigint, delegated = true) => ({
  tokenId,
  amount,
  start: 0,
  votingPower: amount,
  delegated,
});
const exit = (tokenId: bigint, amount: bigint, canExit = false) => ({ tokenId, amount, exitDate: 0, canExit });
const input = {
  account,
  delegate,
  walletBalance: 17_500n,
  bonded: 10_000n,
  vesting: 15_000n,
  ownedLocks: [lock(2n, 10_000n), lock(5n, 125_000n)],
  queuedExits: [exit(1n, 15_000n)],
};

describe("FOLD asset allocation", () => {
  test("the overview includes every lock state once, preserving exact token amounts", () => {
    const large = 123456789012345678901234567890n;
    const parts = foldHoldingParts([
      { kind: "wallet", amount: 1n },
      { kind: "delegated", amount: large },
      { kind: "self", amount: 2n },
      { kind: "undelegated", amount: 3n },
      { kind: "cooldown", amount: 4n },
      { kind: "ready", amount: 5n },
      { kind: "bonded", amount: 6n },
      { kind: "vesting", amount: 7n },
    ]);
    expect(parts).toEqual([
      { kind: "wallet", amount: 1n },
      { kind: "locked", amount: large + 14n },
      { kind: "bonded", amount: 6n },
      { kind: "vesting", amount: 7n },
    ]);
    expect(parts.reduce((sum, part) => sum + part.amount, 0n)).toBe(large + 28n);
  });

  test("account summary includes vesting in locked funds without increasing spendable funds or changing the total", () => {
    const allocation = foldAllocation(input);
    if (allocation.status !== "ready") throw new Error("Missing allocation");
    const parts = foldHoldingParts(allocation.parts, { includeVestingInLocked: true });
    expect(parts).toEqual([
      { kind: "wallet", amount: 2_500n },
      { kind: "locked", amount: 165_000n },
      { kind: "bonded", amount: 10_000n },
    ]);
    expect(parts.reduce((sum, part) => sum + part.amount, 0n)).toBe(allocation.total);
    expect(unvestedBalance(input.walletBalance, 2_500n)).toBe(input.vesting);
  });

  test("an empty overview keeps all four categories at zero", () => {
    expect(foldHoldingParts([])).toEqual([
      { kind: "wallet", amount: 0n },
      { kind: "locked", amount: 0n },
      { kind: "bonded", amount: 0n },
      { kind: "vesting", amount: 0n },
    ]);
  });

  test("sums all owned funds once, splitting vesting out of the ERC20 wallet balance", () => {
    expect(foldAllocation(input)).toEqual({
      status: "ready",
      total: 177_500n,
      parts: [
        { kind: "wallet", amount: 2_500n },
        { kind: "delegated", amount: 135_000n },
        { kind: "cooldown", amount: 15_000n },
        { kind: "bonded", amount: 10_000n },
        { kind: "vesting", amount: 15_000n },
      ],
    });
  });

  test("changing delegate changes allocation labels, never ownership or the total", () => {
    for (const target of [account, account.toUpperCase().replace("0X", "0x") as Address, delegate]) {
      const allocation = foldAllocation({ ...input, delegate: target });
      expect(allocation.status).toBe("ready");
      if (allocation.status !== "ready") throw new Error("Missing allocation");
      expect(allocation.total).toBe(177_500n);
      expect(
        allocation.parts.find((part) => part.kind === (target.toLowerCase() === account ? "self" : "delegated"))?.amount
      ).toBe(135_000n);
    }
  });

  test("undelegated, mixed locks and both withdrawal states retain their token amounts", () => {
    const allocation = foldAllocation({
      ...input,
      ownedLocks: [lock(2n, 10_000n, false), lock(5n, 125_000n)],
      queuedExits: [exit(1n, 10_000n), exit(3n, 5_000n, true)],
    });
    expect(allocation).toMatchObject({ status: "ready", total: 177_500n });
    if (allocation.status !== "ready") throw new Error("Missing allocation");
    expect(allocation.parts).toContainEqual({ kind: "undelegated", amount: 10_000n });
    expect(allocation.parts).toContainEqual({ kind: "ready", amount: 5_000n });
    const inactive = foldAllocation({
      ...input,
      delegate: zeroAddress,
      ownedLocks: input.ownedLocks.map((l) => ({ ...l, delegated: false })),
    });
    expect(inactive).toMatchObject({ status: "ready", total: 177_500n });
    if (inactive.status === "ready") expect(inactive.parts).toContainEqual({ kind: "undelegated", amount: 135_000n });
  });

  test("does not use voting power as token holdings, even when lock voting weight differs", () => {
    expect(
      foldAllocation({ ...input, ownedLocks: input.ownedLocks.map((l) => ({ ...l, votingPower: 999_999_999n })) })
    ).toEqual(foldAllocation(input));
  });

  test("moving a lock into cooldown, back to a lock or into the wallet does not create or lose holdings", () => {
    const states = [
      input,
      { ...input, ownedLocks: [lock(5n, 125_000n)], queuedExits: [exit(1n, 15_000n), exit(2n, 10_000n)] },
      { ...input, ownedLocks: [lock(5n, 125_000n)], queuedExits: [exit(1n, 15_000n), exit(2n, 10_000n, true)] },
      { ...input, ownedLocks: [lock(5n, 125_000n)], walletBalance: 27_500n },
    ];
    for (const state of states) expect(foldAllocation(state)).toMatchObject({ status: "ready", total: 177_500n });
  });

  test("distinguishes zero from missing data and handles a wallet without any locks or delegate", () => {
    expect(
      foldAllocation({
        ...input,
        delegate: undefined,
        walletBalance: 0n,
        bonded: 0n,
        vesting: 0n,
        ownedLocks: [],
        queuedExits: [],
      })
    ).toEqual({ status: "ready", total: 0n, parts: [] });
    for (const missing of ["account", "delegate", "walletBalance", "bonded", "vesting", "ownedLocks", "queuedExits"]) {
      expect(foldAllocation({ ...input, [missing]: undefined })).toEqual({ status: "unavailable" });
    }
  });

  test("refuses incomplete or contradictory snapshots instead of inventing a total", () => {
    for (const change of [
      { vesting: 20_000n },
      { bonded: -1n },
      { delegate: zeroAddress },
      { queuedExits: [exit(2n, 10_000n)] },
      { ownedLocks: [lock(2n, -1n)] },
    ])
      expect(foldAllocation({ ...input, ...change })).toEqual({ status: "unavailable" });
  });

  test("preserves exact totals for balances above Number.MAX_SAFE_INTEGER", () => {
    const large = 123456789012345678901234567890n;
    const allocation = foldAllocation({ ...input, walletBalance: large, vesting: large - 1n });
    expect(allocation).toMatchObject({ status: "ready", total: large + 160_000n });
    if (allocation.status === "ready") expect(allocation.parts).toContainEqual({ kind: "wallet", amount: 1n });
  });

  test("the unvested part is what the token will not move, and stays unknown until both reads arrive", () => {
    expect(unvestedBalance(17_500n, 2_500n)).toBe(15_000n);
    expect(unvestedBalance(15_000n, 15_000n)).toBe(0n);
    // A read that races ahead of the balance must not produce a negative amount.
    expect(unvestedBalance(1n, 2n)).toBe(0n);
    expect(unvestedBalance(undefined, 2_500n)).toBeUndefined();
    expect(unvestedBalance(17_500n, undefined)).toBeUndefined();
  });
});
