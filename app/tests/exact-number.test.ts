import { describe, expect, test } from "bun:test";
import { compactNumber, displayNumber, exactNumber } from "../utils/numbers";

test("compact amount units retain their magnitude at each scale", () => {
  expect(compactNumber("1000")).toBe("1.00K");
  expect(compactNumber("1000000")).toBe("1.00M");
  expect(compactNumber("1000000000")).toBe("1.00B");
  expect(compactNumber("1000000000000")).toBe("1.00T");
  expect(compactNumber("1234500000000")).toBe("1.23T");
});

describe("Readable ballot amounts", () => {
  test("groups thousands and removes only redundant fractional zeros", () => {
    expect(displayNumber("125000.00")).toBe("125,000");
    expect(displayNumber("50000")).toBe("50,000");
    expect(displayNumber("49816.20")).toBe("49,816.2");
    expect(displayNumber("0")).toBe("0");
    expect(displayNumber("0.00000100")).toBe("0.000001");
  });

  test("preserves large values and token precision without floating-point rounding", () => {
    expect(displayNumber("123456789012345678901234567890.123456789123456789")).toBe(
      "123,456,789,012,345,678,901,234,567,890.123456789123456789"
    );
    expect(displayNumber("10000.000000000000000001")).toBe("10,000.000000000000000001");
    expect(displayNumber("110003.999", 2)).toBe("110,003.99");
    expect(displayNumber("NaN")).toBe("-");
    expect(displayNumber("")).toBe("-");
  });
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

  test("cuts to the requested decimals and never rounds up", () => {
    expect(exactNumber("110003.000000000000000001", 2)).toBe("110003.00");
    expect(exactNumber("70.588235294117647059", 2)).toBe("70.58");
  });

  test("does not present unavailable or invalid amounts as zero", () => {
    expect(exactNumber("")).toBe("-");
    expect(exactNumber("-")).toBe("-");
    expect(exactNumber("NaN")).toBe("-");
  });
});
