import { describe, expect, test } from "bun:test";
import { amountCharacters } from "../components/motion/AnimatedAmount";

describe("Amount place-value continuity", () => {
  test("99.50% to 100.00% preserves the decimal point, fraction and percent slots", () => {
    const before = new Map(amountCharacters("99.50%").map(({ key, value }) => [key, value]));
    const after = new Map(amountCharacters("100.00%").map(({ key, value }) => [key, value]));
    expect(before.get("decimal")).toBe(after.get("decimal"));
    expect(before.get("suffix")).toBe(after.get("suffix"));
    expect(before.get("fraction-1")).toBe(after.get("fraction-1"));
    expect(after.get("integer-2")).toBe("1");
    expect(before.has("integer-2")).toBe(false);
    expect(after.get("integer-0")).toBe("0");
    expect(after.get("fraction-0")).toBe("0");
  });

  test("a new thousands group does not reassign existing numeric places or animate the unit", () => {
    const before = new Map(amountCharacters("999 FOLD").map(({ key, value }) => [key, value]));
    const after = amountCharacters("1,000 FOLD");
    expect(after.find(({ key }) => key === "group-3")).toEqual({ key: "group-3", value: "," });
    expect(after.find(({ key }) => key === "suffix")).toEqual({ key: "suffix", value: " FOLD" });
    expect(after.filter(({ digit, key }) => digit && before.has(key)).map(({ key }) => key)).toEqual([
      "integer-2",
      "integer-1",
      "integer-0",
    ]);
  });

  test("retains exact formatted values beyond number precision, with a static fallback for unavailable values", () => {
    const value = "12,345,678,901,234,567,890.000000000000000001 FOLD";
    expect(
      amountCharacters(value)
        .map(({ value: character }) => character)
        .join("")
    ).toBe(value);
    expect(amountCharacters("—")).toEqual([{ key: "label", value: "—" }]);
  });
});
