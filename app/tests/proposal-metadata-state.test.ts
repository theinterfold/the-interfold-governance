import { describe, expect, test } from "bun:test";
import { proposalDocument, proposalMetadataState } from "../utils/proposalMetadataState";

describe("Proposal content availability", () => {
  test("an unfinished read remains loading rather than reporting an empty proposal", () => {
    expect(proposalMetadataState(undefined, { isSuccess: false, error: null })).toBe("loading");
  });

  test("an exhausted metadata read becomes unavailable", () => {
    expect(proposalMetadataState(undefined, { isSuccess: false, error: new Error("Offline") })).toBe("unavailable");
  });

  test("missing or unreadable documents cannot leave the page loading", () => {
    for (const metadata of [undefined, null, "", []]) {
      expect(proposalMetadataState(metadata, { isSuccess: true, error: null })).toBe("unavailable");
    }
  });

  test("a missing or blank title keeps the rest of the document readable", () => {
    for (const title of [undefined, "", "  ", 12, {}]) {
      expect(proposalMetadataState({ title, description: "Keep this text" }, { isSuccess: true, error: null })).toBe("untitled");
    }
  });

  test("malformed fields leave other readable content and chain-backed controls usable", () => {
    const link = { name: "Reference", url: "https://example.com" };
    expect(proposalDocument({ title: "  ", summary: {}, description: "Keep this text", resources: [null, link] }))
      .toEqual({ title: "", summary: "", description: "Keep this text", resources: [link] });
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
