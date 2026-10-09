import { describe, expect, test } from "bun:test";
import { validateProposalDetails } from "../plugins/governance/utils/proposalValidation";

const complete = { title: "Improve governance", summary: "Explain the proposed changes.", resources: [] };

describe("Proposal metadata validation", () => {
  test("reports every missing field in reading order, including links in a closed section", () => {
    const errors = validateProposalDetails({
      title: " \n ",
      summary: "\t",
      resources: [
        { name: "", url: "" },
        { name: "Discussion", url: "not a URL" },
      ],
    });
    expect(errors.map(({ field }) => field)).toEqual([
      "title", "summary", "resource-0-name", "resource-0-url", "resource-1-url",
    ]);
    expect(errors.every(({ message }) => message.length > 0)).toBe(true);
  });

  test("description, links and DAO actions remain optional for a signaling proposal", () => {
    const draft = { ...complete, description: "", actions: [] };
    expect(validateProposalDetails(draft)).toEqual([]);
  });

  test("correcting one field clears only its error without hiding other missing information", () => {
    const draft = { ...complete, title: "", summary: "", resources: [{ name: "", url: "" }] };
    expect(validateProposalDetails(draft)).toHaveLength(4);
    draft.title = "A proposal";
    expect(validateProposalDetails(draft).map(({ field }) => field)).toEqual([
      "summary", "resource-0-name", "resource-0-url",
    ]);
  });

  test("removing an incomplete link clears its errors and keeps later field targets accurate", () => {
    const resources = [
      { name: "", url: "" },
      { name: "Discussion", url: "https://forum.example.com/topic/1" },
      { name: "Document", url: "bad URL" },
    ];
    expect(validateProposalDetails({ ...complete, resources: resources.slice(1) }).map(({ field }) => field))
      .toEqual(["resource-1-url"]);
    expect(validateProposalDetails({ ...complete, resources: [resources[1]] })).toEqual([]);
  });

  test("preserves the existing URL policy and trims surrounding whitespace for validation", () => {
    expect(validateProposalDetails({
      ...complete,
      resources: [
        { name: " Site ", url: " https://theinterfold.com/ " },
        { name: "Forum", url: "forum.example.com/topic/1" },
      ],
    })).toEqual([]);
    for (const url of [" ", "javascript:alert(1)", "a link without a domain"]) {
      expect(validateProposalDetails({ ...complete, resources: [{ name: "Link", url }] })[0]?.field)
        .toBe("resource-0-url");
    }
  });
});
