import { describe, expect, test } from "bun:test";
import { feeDepositAmount } from "../plugins/crispVoting/utils/feeDepositAmount";

describe("Fee credit amount validation", () => {
  test("waits for a real amount, token precision and wallet balance", () => {
    expect(feeDepositAmount("", 6, 50000000n).amount).toBeUndefined();
    expect(feeDepositAmount("5", undefined, 50000000n).amount).toBeUndefined();
    expect(feeDepositAmount("5", 6, undefined).amount).toBeUndefined();
  });
  test("uses fee-token precision without rounding or floating-point conversion", () => {
    expect(feeDepositAmount("12.345678", 6, 50000000n).amount).toBe(12345678n);
    expect(feeDepositAmount("0.0000001", 6, 50000000n).error).toBeDefined();
    expect(feeDepositAmount("1.0000009", 6, 50000000n).error).toBeDefined();
    expect(feeDepositAmount(".000000000000000001", 18, 100n).amount).toBe(1n);
    expect(feeDepositAmount("2", 0, 10n).amount).toBe(2n);
    expect(feeDepositAmount("2.5", 0, 10n).error).toBeDefined();
  });
  test("rejects invalid, zero, negative and over-balance deposits", () => {
    for (const input of ["0", "-1", ".", "1e3", "NaN", "1.2.3", "51"]) {
      expect(feeDepositAmount(input, 6, 50000000n).error).toBeDefined();
    }
    expect(feeDepositAmount("50", 6, 50000000n).amount).toBe(50000000n);
    expect(feeDepositAmount("0.000001", 6, 0n).error).toBeDefined();
  });
});
