import { describe, expect, test } from "bun:test";
import { parseActionValue } from "../utils/action-value";

describe("Proposal action amount editing", () => {
  test("opening or clearing a required payment leaves no submittable amount", () => {
    expect(parseActionValue("")).toBeNull();
    expect(parseActionValue(" ")).toBeNull();
    expect(parseActionValue(".")).toBeNull();
  });
  test("an omitted optional value is zero, but unfinished or invalid input is not", () => {
    expect(parseActionValue("", true)).toBe(0n);
    for (const value of [".", "-1", "NaN", "1e18", "1.2.3"]) {
      expect(parseActionValue(value, true)).toBeNull();
    }
  });
  test("decimal amounts retain exact wei precision", () => {
    expect(parseActionValue("0")).toBe(0n);
    expect(parseActionValue(".5")).toBe(500000000000000000n);
    expect(parseActionValue("1.")).toBe(1000000000000000000n);
    expect(parseActionValue("0.000000000000000001")).toBe(1n);
    expect(parseActionValue("1.234567890123456789")).toBe(1234567890123456789n);
  });
});
