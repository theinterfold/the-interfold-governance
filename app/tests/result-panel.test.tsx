import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalStatus } from "@aragon/ods";
import { ResultNotice, ResultPanel, resultPercentages, type ResultRow } from "../components/proposalVoting/resultPanel";
import { BallotDisclosure } from "../components/proposalVoting/ballotDisclosure";
import { publicResultQuorum } from "../plugins/tokenVoting/components/voteResultCard";
import { computeQuorum } from "../plugins/crispVoting/utils/quorum";
import { CreditsMode } from "../plugins/crispVoting/utils/types";

const unit = 10n ** 18n;
const rows: ResultRow[] = [
  { option: "Yes", index: 0, percentage: 72, amount: "72,000 FOLD" },
  { option: "No", index: 1, percentage: 18, amount: "18,000 FOLD" },
  { option: "Abstain", index: 2, percentage: 10, amount: "10,000 FOLD" },
];
const quorum = { reached: true, turnoutPct: 10, requiredPct: 1 };
const render = (props: Partial<Parameters<typeof ResultPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <ResultPanel rows={rows} total="100,000 FOLD" status={ProposalStatus.EXECUTED} quorum={quorum} {...props} />
  );

describe("Shared public and secret results", () => {
  test("equivalent raw-token and scaled CRISP tallies produce identical shares and quorum", () => {
    const raw = [72000n * unit, 18000n * unit, 10000n * unit];
    const scaled = [720000n, 180000n, 100000n];
    expect(resultPercentages(raw)).toEqual([72, 18, 10]);
    expect(resultPercentages(scaled)).toEqual(resultPercentages(raw));
    const publicQuorum = publicResultQuorum(100000n * unit, 10000n * unit, 1000000n * unit);
    const secretQuorum = computeQuorum(1000000n, 1000000n * unit, 1, CreditsMode.CUSTOM, 18);
    expect(publicQuorum).toEqual(secretQuorum);
    expect(render({ quorum: publicQuorum })).toBe(render({ quorum: secretQuorum }));
  });

  test("a rejected proposal can highlight a leading share without describing it as an approving winner", () => {
    const html = render({ status: ProposalStatus.REJECTED });
    expect(html).toContain("Vote rejected");
    expect(html).not.toContain("won with");
    expect(html).toContain('data-leading="true"');
    const lowTurnout = render({ status: ProposalStatus.REJECTED, quorum: { ...quorum, reached: false } });
    expect(lowTurnout).toContain("Vote rejected");
    expect(lowTurnout).toContain("Quorum not reached. Participation was below the required minimum.");
    expect(lowTurnout).not.toContain("won with");
  });

  test("a rejected vote with unavailable quorum does not invent a support failure", () => {
    const html = render({ status: ProposalStatus.REJECTED, quorum: null });
    expect(html).toContain("The vote did not meet the approval requirements.");
    expect(html).not.toContain("The required support was not reached.");
  });

  test("abstentions can be the largest share without being the approving option", () => {
    const html = render({ rows: rows.map((row, index) => ({ ...row, percentage: [20, 10, 70][index] })) });
    expect(html).toContain("Yes received 20.0% of the voting power cast.");
    expect(html).not.toContain("Abstain won");
    expect(html.match(/data-leading="true"[^>]*>[\s\S]*?<span class="truncate">([^<]+)/)?.[1]).toBe("Abstain");
  });

  test("a rejected vote highlights a unique No lead, while ties and empty shares have no leader", () => {
    const rejected = render({
      status: ProposalStatus.REJECTED,
      rows: rows.map((row, index) => ({ ...row, percentage: [18, 72, 10][index] })),
    });
    expect(rejected).toContain("Vote rejected");
    expect(rejected.match(/data-leading="true"[^>]*>[\s\S]*?<span class="truncate">([^<]+)/)?.[1]).toBe("No");
    expect(rejected).not.toContain("won with");
    for (const shares of [
      [45, 45, 10],
      [0, 0, 0],
    ]) {
      expect(render({ rows: rows.map((row, index) => ({ ...row, percentage: shares[index] })) })).not.toContain(
        'data-leading="true"'
      );
    }
  });

  test("empty rows cannot establish that no votes were cast", () => {
    const html = render({ rows: [], status: ProposalStatus.REJECTED, isEmpty: true });
    expect(html).toContain("Confirming result");
    expect(html).not.toContain("No votes cast");
    expect(html).not.toContain("Vote rejected");
  });

  test("pending zero tallies with low quorum remain unresolved", () => {
    for (const status of [undefined, ProposalStatus.PENDING]) {
      const html = render({
        status,
        isEmpty: true,
        quorum: { ...quorum, reached: false },
      });
      expect(html).toContain("Confirming result");
      expect(html).not.toContain("No votes cast");
      expect(html).not.toContain("Vote rejected");
    }
  });

  test("a resolved rejection with an explicit zero raw tally says no votes were cast", () => {
    const html = render({ status: ProposalStatus.REJECTED, isEmpty: true });
    expect(html).toContain("No votes cast");
    expect(html).toContain("No votes were cast. This proposal did not pass.");
    expect(html).not.toContain("Vote rejected");
  });

  test("rounded zero shares are not treated as an empty raw tally", () => {
    const html = render({ status: ProposalStatus.ACCEPTED, rows: rows.map((row) => ({ ...row, percentage: 0 })) });
    expect(html).toContain("Vote passed");
    expect(html).toContain("Yes received 0.0% of the voting power cast.");
    expect(html).not.toContain("No votes cast");
  });

  test("unresolved status and a zero raw tally do not invent an outcome", () => {
    expect(render({ status: undefined, quorum: null, isEmpty: true })).toContain("Confirming result");
    expect(resultPercentages([0n, 0n, 0n])).toEqual([0, 0, 0]);
    const html = render({ rows: [], status: undefined, isEmpty: true });
    expect(html).not.toContain("No votes cast");
    expect(html).not.toContain("won with");
  });

  test("public and private result notices use the same result frame", () => {
    const notice = renderToStaticMarkup(
      <ResultNotice state="Voting closed" title="Confirming result">
        <p>Totals are not available yet.</p>
      </ResultNotice>
    );
    const panel = render({ status: undefined, quorum: null });
    expect(notice).toContain('class="vp-label-change"');
    expect(notice).toContain('class="vp-body');
    expect(panel).toContain('class="vp-label-change"');
    expect(panel).toContain('class="vp-body');
    expect(notice).toContain("Result");
  });

  test("a submitted result is information and cannot repeat its transaction", () => {
    const html = render({ submitted: true, action: <button>Submit result</button> });
    expect(html).toContain("Result submitted");
    expect(html).not.toContain(">Submit result</button>");
    expect(render({ submitted: false, action: <button>Submit result</button> })).toContain("<button");
  });

  test("public quorum preserves raw precision at the threshold and handles unavailable supply", () => {
    expect(publicResultQuorum(10000n * unit, 10000n * unit, 1000000n * unit)?.reached).toBe(true);
    expect(publicResultQuorum(10000n * unit - 1n, 10000n * unit, 1000000n * unit)?.reached).toBe(false);
    expect(publicResultQuorum(1n, 0n, unit)?.reached).toBe(true);
    expect(publicResultQuorum(unit, unit, undefined)).toBeNull();
    expect(publicResultQuorum(unit, unit, 0n)).toBeNull();
  });

  test("supporting details start closed and use the existing reversible disclosure", () => {
    const html = renderToStaticMarkup(
      <BallotDisclosure title="Voting details">
        <a href="#facts">Facts</a>
      </BallotDisclosure>
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="motion-disclosure');
    expect(html).toContain('data-open="false"');
  });
});
