import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalReadingHeader } from "../components/proposal/proposalReadingHeader";
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
  for (const kind of ["Secret ballot", "Transparent fallback"]) {
    test(`${kind} shows the status once and retains a distinct stage or deadline`, () => {
      const header = { title: "Voting on Aztec", summary: "", creator: "", status: "Accepted", kind };
      const html = renderToStaticMarkup(<ProposalReadingHeader {...header} timing="Accepted" />);
      expect(html.match(/>Accepted</g)).toHaveLength(1);
      expect(html).not.toContain('data-proposal-part="timing"');
      for (const timing of ["Awaiting Foundation stage", <time key="end">Ends in 2h</time>]) {
        expect(renderToStaticMarkup(<ProposalReadingHeader {...header} timing={timing} />)).toContain('data-proposal-part="timing"');
      }
    });
  }

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

  test("an unavailable or pending document keeps the ballot, stage and results mounted", () => {
    for (const state of ["loading", "unavailable", "untitled"] as const) {
      const html = renderToStaticMarkup(<ProposalDetailLayout {...props} contentState={state} onRetryContent={() => {}} />);
      for (const text of ["Existing ballot action", "Stage details", "Round progress"]) expect(html).toContain(text);
      if (state === "unavailable") expect(html).toContain("Try again");
      if (state === "untitled") expect(html).toContain('data-testid="doc-parser"');
    }
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
