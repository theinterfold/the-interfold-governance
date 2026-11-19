import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalDetailLayout } from "../components/proposal/proposalDetailLayout";
import { ProposalLayoutContext } from "../components/proposal/proposalLayoutContext";

const props = {
  header: <h1>Proposal document</h1>,
  description: "<p>Complete proposal text</p>",
  actions: [],
  voting: <button>Existing ballot action</button>,
  participation: <p>Participation details</p>,
  stage: <p>Stage details</p>,
  networkProgress: <p>Round progress</p>,
  proposalHref: "/plugins/proposals/#/proposals/private/1",
  resources: [{ name: "Documentation", url: "https://docs.theinterfold.com/" }],
};

describe("Dedicated proposal reading", () => {
  test("reader preserves the document and resources but does not mount the ballot or round", () => {
    const html = renderToStaticMarkup(<ProposalDetailLayout {...props} readingOnly />);
    expect(html).toContain("Proposal document");
    // ODS's document parser hydrates its text in the browser.
    expect(html).toContain('data-testid="doc-parser"');
    expect(html).toContain("Read the help guide");
    expect(html).toContain("Back to voting");
    expect(html).toContain('data-expanded="true"');
    expect(html).not.toContain("Existing ballot action");
    expect(html).not.toContain("Round progress");
    expect(html).not.toContain("Expand proposal");
  });

  test("normal proposal keeps the actual ballot alongside the full document", () => {
    const html = renderToStaticMarkup(<ProposalDetailLayout {...props} />);
    expect(html).toContain("Existing ballot action");
    expect(html).toContain("Round progress");
    expect(html).toContain('data-expanded="true"');
    expect(html).toContain('data-testid="doc-parser"');
    expect(html).not.toContain('href="/plugins/proposals/#/proposals/private/1/read"');
    expect(html).not.toContain("Expand proposal");
  });

  test("original comparison retains the ballot and the previous collapsed document behavior", () => {
    const html = renderToStaticMarkup(
      <ProposalLayoutContext.Provider value="original"><ProposalDetailLayout {...props} /></ProposalLayoutContext.Provider>
    );
    expect(html).toContain("Existing ballot action");
    expect(html).toContain('data-expanded="false"');
    expect(html).not.toContain("Expand proposal");
  });
});
