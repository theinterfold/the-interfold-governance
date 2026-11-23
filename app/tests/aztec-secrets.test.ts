import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import {
  aztecAccountStorageKey,
  localStorageAdapter,
  outOfStagingPasses,
  parseStoredAccount,
  stagingCounter,
  stagingCounterKey,
  type KeyValueStorage,
} from "../plugins/crispVoting/utils/aztec/secrets";

const memory = (): KeyValueStorage & { entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
  };
};

const program = "0x00000000000000000000000000000000000000C3" as Address;
const slot = "0x00000000000000000000000000000000000000A1" as Address;

describe("the Aztec account of a wallet", () => {
  test("is stored under one key per wallet, whatever the address casing", () => {
    expect(aztecAccountStorageKey(slot)).toBe(aztecAccountStorageKey(slot.toLowerCase() as Address));
    expect(aztecAccountStorageKey(slot)).not.toBe(aztecAccountStorageKey(program));
  });

  test("is read back when it holds three hex fields", () => {
    const account = { secret: "0x01", salt: "0x02", signingKey: `0x${"ab".repeat(32)}` } as const;
    expect(parseStoredAccount(JSON.stringify(account))).toEqual(account);
  });

  test("is replaced when the stored value is missing, damaged or incomplete", () => {
    expect(parseStoredAccount(null)).toBeUndefined();
    expect(parseStoredAccount("not json")).toBeUndefined();
    expect(parseStoredAccount("null")).toBeUndefined();
    expect(parseStoredAccount(JSON.stringify({ secret: "0x01", salt: "0x02" }))).toBeUndefined();
    expect(parseStoredAccount(JSON.stringify({ secret: "0x01", salt: "0x02", signingKey: "nope" }))).toBeUndefined();
    expect(parseStoredAccount(JSON.stringify({ secret: "0x01", salt: "0x02", signingKey: `0x${"ab".repeat(33)}` }))).toBeUndefined();
  });
});

describe("the storage adapter the SDK stores use", () => {
  test("reads and writes the given key unchanged", () => {
    const storage = memory();
    const adapter = localStorageAdapter(storage);
    expect(adapter.get("a")).toBeNull();
    adapter.set("a", "0x1");
    expect(adapter.get("a")).toBe("0x1");
    expect(storage.entries.get("a")).toBe("0x1");
  });
});

describe("the staging counter", () => {
  test("is keyed per program, round and slot, whatever the address casing", () => {
    const key = stagingCounterKey(program, 7n, slot);
    expect(key).toBe(stagingCounterKey(program.toLowerCase() as Address, 7n, slot.toLowerCase() as Address));
    expect(key).not.toBe(stagingCounterKey(program, 8n, slot));
    expect(key).not.toBe(stagingCounterKey(program, 7n, program));
  });

  test("starts at zero and moves only when a counter is spent", () => {
    const counter = stagingCounter(memory());
    const key = stagingCounterKey(program, 7n, slot);
    expect(counter.next(key)).toBe(0);
    expect(counter.next(key)).toBe(0);
    counter.spend(key, 0);
    expect(counter.next(key)).toBe(1);
  });

  test("never moves back when an older counter is spent again", () => {
    const counter = stagingCounter(memory());
    const key = stagingCounterKey(program, 7n, slot);
    counter.spend(key, 2);
    counter.spend(key, 0);
    expect(counter.next(key)).toBe(3);
  });

  test("names the limit when the voter is out of passes", () => {
    expect(outOfStagingPasses(3).message).toContain("used all 3 ballots");
  });

  test("refuses a corrupt stored count", () => {
    const storage = memory();
    const key = stagingCounterKey(program, 7n, slot);
    storage.setItem(key, "-2");
    expect(() => stagingCounter(storage).next(key)).toThrow("corrupt");
    storage.setItem(key, "x");
    expect(() => stagingCounter(storage).next(key)).toThrow("corrupt");
  });
});
