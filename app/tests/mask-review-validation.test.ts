import { describe, expect, test } from "bun:test";
import { maskReviewIssue } from "../plugins/crispVoting/utils/maskReviewValidation";
const address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const voters = [{ address, balance: 1n }];
const random = { mode: "random" as const, target: "" };
const chosen = (target: string) => ({ mode: "address" as const, target });
describe("Mask review prerequisites", () => {
  test("random recipients need a census, not an address picked in advance", () => {
    expect(maskReviewIssue([random], voters)).toBeNull();
    expect(maskReviewIssue([random])).toBe("loading");
    expect(maskReviewIssue([random], [])).toBe("no-voters");
    expect(maskReviewIssue([random], voters, true)).toBe("unavailable");
  });
  test("a chosen wallet must be present, valid and eligible", () => {
    expect(maskReviewIssue([chosen("")], voters)).toBe("missing-wallet");
    expect(maskReviewIssue([chosen("oops")], voters)).toBe("invalid-wallet");
    expect(maskReviewIssue([chosen("0x" + "1".repeat(40))], voters)).toBe("ineligible-wallet");
    expect(maskReviewIssue([chosen(" " + address + " ")], voters)).toBeNull();
  });
  test("all masks must be ready; fixing the last invalid entry allows review", () => {
    expect(maskReviewIssue([random, chosen(address), chosen("")], voters)).toBe("missing-wallet");
    expect(maskReviewIssue([random, chosen(address), chosen(address)], voters)).toBeNull();
    expect(maskReviewIssue([], voters)).toBe("no-masks");
  });
});
