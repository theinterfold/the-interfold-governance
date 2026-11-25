import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalReadingHeader } from "../components/proposal/proposalReadingHeader";
import { ProposalDetailLoading } from "../components/proposal/proposalLoading";
import { ParticipationDetails } from "../components/proposalVoting/participationDetails";
import { ProposalRow } from "../plugins/governance/components/proposalRow";
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
  test("available text is readable during contract checks without promising a result or voting action", () => {
    const document = { title: "Community grants", summary: "Two proposed grants" };
    const row = <ProposalRow loading kindLabel="Secret ballot" href="#/proposals/private/1" {...document} />;
    const detail = <ProposalDetailLoading embedded={false} document={document} />;
    for (const element of [row, detail]) {
      const html = renderToStaticMarkup(element);
      expect(html).toContain(document.title);
      expect(html).toContain(document.summary);
      expect(html).toContain('aria-busy="true"');
      expect(html).not.toContain("<button");
      expect(html).not.toContain("Vote passed");
    }
  });

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

describe("Voting detail topics", () => {
  test("a published turnout is readable before opening the breakdown", () => {
    const html = renderToStaticMarkup(<ParticipationDetails turnout="2.93%" voted="35.15M FOLD"
      minimum="24.00M FOLD" threshold="2%" total="1.20B FOLD" reached />);
    const [trigger, breakdown] = html.split("</button>");
    expect(trigger).toContain('aria-expanded="false"');
    expect(trigger).toContain("2.93% turnout");
    expect(trigger).not.toContain("35.15M");
    expect(breakdown).toContain("35.15M FOLD");
    expect(breakdown).toContain("24.00M FOLD");
    expect(breakdown).toContain(">Met<");
  });

  test("before the encrypted tally only the known requirements are shown", () => {
    const html = renderToStaticMarkup(<ParticipationDetails encrypted minimum="None" total="1.20B FOLD" />);
    expect(html.split("</button>")[0]).toContain("Awaiting tally");
    expect(html).not.toContain("0% turnout");
    expect(html).not.toContain("Voting power cast");
    expect(html).not.toContain(">Met<");
  });
});
