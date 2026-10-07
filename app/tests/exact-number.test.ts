import { describe, expect, test } from "bun:test";
import { compactNumber, exactNumber } from "../utils/numbers";

test("compact amount units retain their magnitude at each scale", () => {
  expect(compactNumber("1000")).toBe("1.00K");
  expect(compactNumber("1000000")).toBe("1.00M");
  expect(compactNumber("1000000000")).toBe("1.00B");
  expect(compactNumber("1000000000000")).toBe("1.00T");
  expect(compactNumber("1234500000000")).toBe("1.23T");
});

describe("Exact token amount display", () => {
  test("shares the decimal point convention without thousands commas", () => {
    expect(exactNumber("10000")).toBe("10000.00");
    expect(exactNumber("00100.5")).toBe("100.50");
    expect(exactNumber("0")).toBe("0.00");
    expect(exactNumber(".5")).toBe("0.50");
  });

  test("preserves all token precision and values beyond JS safe integers", () => {
    expect(exactNumber("10000.000000000000000001")).toBe("10000.000000000000000001");
    expect(exactNumber("123456789012345678901234567890.123456789123456789")).toBe(
      "123456789012345678901234567890.123456789123456789"
    );
    expect(exactNumber("10000.125000000000000000")).toBe("10000.125");
  });

  test("does not present unavailable or invalid amounts as zero", () => {
    expect(exactNumber("")).toBe("—");
    expect(exactNumber("—")).toBe("—");
    expect(exactNumber("NaN")).toBe("—");
  });
});
