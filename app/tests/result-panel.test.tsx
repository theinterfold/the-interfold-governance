import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalStatus } from "@aragon/ods";
import { ResultPanel, resultPercentages, type ResultRow } from "../components/proposalVoting/resultPanel";
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

  test("a rejected proposal never describes its leading option as the winner", () => {
    const html = render({ status: ProposalStatus.REJECTED });
    expect(html).toContain("Rejected");
    expect(html).not.toContain("won with");
    expect(html).not.toContain('data-leading="true"');
    const lowTurnout = render({ status: ProposalStatus.REJECTED, quorum: { ...quorum, reached: false } });
    expect(lowTurnout).toContain("Rejected — quorum not reached");
  });

  test("abstentions can be the largest share without being the approving option", () => {
    const html = render({ rows: rows.map((row, index) => ({ ...row, percentage: [20, 10, 70][index] })) });
    expect(html).toContain("Yes won with 20.0%");
    expect(html).not.toContain("Abstain won");
  });

  test("unresolved status and empty votes do not invent an outcome", () => {
    expect(render({ status: undefined, quorum: null })).toContain("Confirming result");
    expect(resultPercentages([0n, 0n, 0n])).toEqual([0, 0, 0]);
    const html = render({ rows: rows.map((row) => ({ ...row, percentage: 0 })) });
    expect(html).toContain("No votes were cast");
    expect(html).not.toContain("won with");
  });

  test("a submitted result is information and cannot repeat its transaction", () => {
    const html = render({ submitted: true, action: <button>Submit result</button> });
    expect(html).toContain("Result submitted");
    expect(html).not.toContain("<button");
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
