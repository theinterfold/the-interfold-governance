import { describe, expect, test } from "bun:test";
import { aztecRoundGate, checkAztecCommitteeKey, toActivityEntries } from "../plugins/crispVoting/utils/aztec/status";

const open = { opened: true, keyPublished: true, closed: false, now: 150, inputStart: 100, inputEnd: 200 };

describe("whether a round accepts a ballot on Aztec", () => {
  test("accepts inside the input window once the round is open with its key", () => {
    expect(aztecRoundGate(open)).toEqual({ open: true });
  });

  test("says which precondition is missing, in the order the contract needs them", () => {
    expect(aztecRoundGate({ ...open, opened: false, keyPublished: false })).toMatchObject({ open: false, reason: expect.stringContaining("not reached Aztec") });
    expect(aztecRoundGate({ ...open, keyPublished: false })).toMatchObject({ open: false, reason: expect.stringContaining("committee key") });
    expect(aztecRoundGate({ ...open, closed: true })).toMatchObject({ open: false, reason: expect.stringContaining("closed on Aztec") });
  });

  test("the window opens at its start and closes at its end", () => {
    expect(aztecRoundGate({ ...open, now: 99 })).toMatchObject({ open: false, reason: expect.stringContaining("not opened") });
    expect(aztecRoundGate({ ...open, now: 100 })).toEqual({ open: true });
    expect(aztecRoundGate({ ...open, now: 199 })).toEqual({ open: true });
    expect(aztecRoundGate({ ...open, now: 200 })).toMatchObject({ open: false, reason: expect.stringContaining("closed") });
  });
});

describe("the committee key on Aztec", () => {
  const key = "0x00000000000000000000000000000000000000000000000000000000000000ab";

  test("must be the commitment Interfold published", () => {
    expect(checkAztecCommitteeKey(key, key)).toEqual({ ok: true });
    expect(checkAztecCommitteeKey(key, "0x00000000000000000000000000000000000000000000000000000000000000ac")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("not the one Interfold published"),
    });
  });

  test("blocks voting until it has reached Aztec", () => {
    expect(checkAztecCommitteeKey(undefined, key)).toMatchObject({ ok: false, reason: expect.stringContaining("not reached Aztec") });
  });
});

describe("the activity list from Aztec's committed inputs", () => {
  test("lists the newest input first with its transaction and block", () => {
    const logs = [
      { index: 0, origin: { txHash: "0xa", blockNumber: 10 } },
      { index: 2, origin: { txHash: "0xc", blockNumber: 12 } },
      { index: 1, origin: { txHash: "0xb", blockNumber: 11 } },
    ];
    expect(toActivityEntries(logs)).toEqual([
      { index: 2, txHash: "0xc", blockNumber: 12 },
      { index: 1, txHash: "0xb", blockNumber: 11 },
      { index: 0, txHash: "0xa", blockNumber: 10 },
    ]);
  });

  test("is empty for a round with no inputs", () => {
    expect(toActivityEntries([])).toEqual([]);
  });
});
