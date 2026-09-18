import { describe, expect, test } from "bun:test";
import { formatSettlementOpensAt } from "@/plugins/crispVoting/utils/formatSettlementOpensAt";

/**
 * The refund is time-locked after a round fails: Interfold freezes the payer snapshot while a
 * committee accusation can still be filed, so `processE3Failure` reverts `SettlementBlocked()`
 * until the accusation window closes. The card tells the reader when to come back, and this is
 * the arithmetic behind that sentence.
 */
describe("formatSettlementOpensAt", () => {
  const now = () => Math.floor(Date.now() / 1000);

  test("a deadline ~20 hours out reads in hours", () => {
    const text = formatSettlementOpensAt(now() + 20 * 3600);
    expect(text).toContain("in about 20 hours");
  });

  test("under an hour reads in minutes, not '0 hours'", () => {
    const text = formatSettlementOpensAt(now() + 25 * 60);
    expect(text).toContain("minutes");
    expect(text).not.toContain("hours");
  });

  test("beyond two days reads in days, so a 38-day cutoff is not '912 hours'", () => {
    const text = formatSettlementOpensAt(now() + 38 * 86400);
    expect(text).toContain("in about 38 days");
  });

  /**
   * The contract compares against BLOCK time, which can trail the browser clock. A deadline that
   * has just passed must not render as a negative wait — the reader should simply retry.
   */
  test("a past deadline reads as imminent, never negative", () => {
    const text = formatSettlementOpensAt(now() - 3600);
    expect(text).toContain("shortly");
    expect(text).not.toContain("-");
  });

  test("always carries the absolute local time alongside the relative wait", () => {
    const opensAt = now() + 5 * 3600;
    const text = formatSettlementOpensAt(opensAt);
    expect(text).toContain(new Date(opensAt * 1000).toLocaleString());
  });
});
