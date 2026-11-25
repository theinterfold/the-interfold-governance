import { describe, expect, test } from "bun:test";
import {
  appendPreparedMaskReceipt,
  preparedMaskReceiptsFor,
  preparedMaskScope,
} from "../plugins/crispVoting/utils/preparedMaskReceipts";

const signer = "0x00000000000000000000000000000000000000aA";
const sender = "0x00000000000000000000000000000000000000bB";
const first = `0x${"1".repeat(64)}`;
const second = `0x${"2".repeat(64)}`;

describe("Mask receipts accompanying a prepared vote", () => {
  test("retains successful masks across preparation retry and sender handoff for the same signer", () => {
    const scope = preparedMaskScope(7n, signer)!;
    let state = appendPreparedMaskReceipt(null, scope, first);
    // A failed next mask or failed vote preparation adds no receipt. The retry adds only success.
    state = appendPreparedMaskReceipt(state, scope, second);
    expect(preparedMaskReceiptsFor(state, preparedMaskScope(7n, signer.toLowerCase()))).toEqual([first, second]);
    // Connecting the gas-paying sender must not relabel the masks as that wallet's activity.
    expect(preparedMaskReceiptsFor(state, preparedMaskScope(7n, sender))).toEqual([]);
    expect(preparedMaskReceiptsFor(state, scope)).toEqual([first, second]);
  });

  test("a different round or new voter never inherits the previous flow's receipts", () => {
    const scope = preparedMaskScope(7n, signer)!;
    const state = appendPreparedMaskReceipt(null, scope, first);
    expect(preparedMaskReceiptsFor(state, preparedMaskScope(8n, signer))).toEqual([]);
    const next = appendPreparedMaskReceipt(state, preparedMaskScope(7n, sender)!, second);
    expect(next.receipts).toEqual([second]);
    expect(preparedMaskReceiptsFor(next, scope)).toEqual([]);
  });

  test("clearing a flow removes its receipt summary, including relayed masks without a hash", () => {
    const scope = preparedMaskScope(7n, signer)!;
    const state = appendPreparedMaskReceipt(null, scope, null);
    expect(preparedMaskReceiptsFor(state, scope)).toEqual([null]);
    expect(preparedMaskReceiptsFor(null, scope)).toEqual([]);
    expect(preparedMaskReceiptsFor(null, undefined)).toEqual([]);
  });
});
