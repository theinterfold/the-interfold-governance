import { describe, expect, test } from "bun:test";
import { proposalMetadataState } from "../utils/proposalMetadataState";

describe("Proposal content availability", () => {
  test("an unfinished read remains loading rather than reporting an empty proposal", () => {
    expect(proposalMetadataState(undefined, { isSuccess: false, error: null })).toBe("loading");
  });

  test("an exhausted metadata read becomes unavailable", () => {
    expect(proposalMetadataState(undefined, { isSuccess: false, error: new Error("Offline") })).toBe("unavailable");
  });

  test("completed empty or malformed titles cannot leave the page loading", () => {
    for (const metadata of [undefined, null, "", {}, { title: "" }, { title: "  " }, { title: 12 }, { title: {} }]) {
      expect(proposalMetadataState(metadata, { isSuccess: true, error: null })).toBe("unavailable");
    }
  });

  test("readable content is ready", () => {
    expect(proposalMetadataState({ title: "Proposal" }, { isSuccess: true, error: null })).toBe("ready");
  });

  test("cached readable content survives a refresh or refresh failure", () => {
    const metadata = { title: "Proposal" };
    expect(proposalMetadataState(metadata, { isSuccess: false, error: null })).toBe("ready");
    expect(proposalMetadataState(metadata, { isSuccess: false, error: new Error("Offline") })).toBe("ready");
  });
});
