import { describe, expect, test } from "bun:test";
import { explainContractError, KNOWN_ERROR_SELECTORS } from "@/utils/explainContractError";
import { describeFailure } from "@/plugins/crispVoting/utils/describeFailure";

/**
 * A reverted call reaches the UI as a bare 4-byte selector. Every case below is one this session
 * actually hit on live Sepolia, where the user saw only hex.
 */
describe("explainContractError", () => {
  test("names SettlementBlocked from a viem-style message", () => {
    const err = {
      shortMessage: 'The contract function "processE3Failure" reverted with the following signature: 0xf51125bb',
    };
    expect(explainContractError(err)?.title).toBe("The refund cannot be settled yet");
  });

  test("names RequestsPaused", () => {
    expect(explainContractError({ message: "reverted: 0xc2ddbfe4" })?.title).toBe(
      "Interfold is not accepting new rounds"
    );
  });

  /** The selector often arrives only on the nested cause, not the top-level message. */
  test("finds the selector on a nested cause", () => {
    const err = { message: "Execution reverted", cause: { data: "0xb381152f" } };
    expect(explainContractError(err)?.title).toBe("The encryption parameters do not match the protocol");
  });

  test("matching is case-insensitive", () => {
    expect(explainContractError({ message: "0xF51125BB" })?.title).toBe("The refund cannot be settled yet");
  });

  /** A selector with ABI-encoded arguments appended must still match on its first four bytes. */
  test("matches a selector carrying encoded arguments", () => {
    const withArgs = "0x3f0c4e2d" + "0".repeat(192);
    expect(explainContractError({ data: withArgs })?.title).toBe("Not enough unlocked balance");
  });

  test("returns undefined for an unknown selector", () => {
    expect(explainContractError({ message: "reverted: 0xdeadbeef" })).toBeUndefined();
  });

  test("returns undefined when there is nothing to read", () => {
    expect(explainContractError(undefined)).toBeUndefined();
    expect(explainContractError({})).toBeUndefined();
  });

  test("every selector is a well-formed 4-byte hex string", () => {
    expect(KNOWN_ERROR_SELECTORS.length).toBeGreaterThan(10);
    for (const s of KNOWN_ERROR_SELECTORS) {
      expect(s).toMatch(/^0x[0-9a-f]{8}$/);
    }
  });

  test("no duplicate selectors map to different errors", () => {
    expect(new Set(KNOWN_ERROR_SELECTORS).size).toBe(KNOWN_ERROR_SELECTORS.length);
  });
});

describe("describeFailure", () => {
  test("prefers the explanation over the raw selector message", () => {
    const err = { shortMessage: "reverted with the following signature: 0xf51125bb" };
    const text = describeFailure(err, "fallback");
    expect(text).toContain("The refund cannot be settled yet");
    expect(text).not.toContain("0xf51125bb");
  });

  test("falls back to the raw message for an unrecognised revert", () => {
    const err = { shortMessage: "reverted: 0xdeadbeef" };
    expect(describeFailure(err, "fallback")).toBe("reverted: 0xdeadbeef");
  });

  /** A declined signature is already reported by the transaction manager; do not double-alert. */
  test("stays silent when the user rejected the signature", () => {
    expect(describeFailure({ message: "User rejected the request" }, "fallback")).toBeUndefined();
  });

  test("uses the fallback when the error carries nothing readable", () => {
    expect(describeFailure({}, "The lock could not be completed")).toBe("The lock could not be completed");
  });
});
