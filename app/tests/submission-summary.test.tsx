import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MaskSubmissionSummary, SubmissionSummary, VoteChangeAction } from "../plugins/crispVoting/components/vote/voteConfirmation";

const voteHash = `0x${"1".repeat(64)}`,
  maskHash = `0x${"2".repeat(64)}`;
const defaults = {
  busy: true,
  activeKind: "vote" as const,
  includeVote: true,
  includeMask: true,
  first: "mask" as const,
  option: "Yes",
  maskReceipts: [],
  maskRun: null,
  detail: "Encrypting your ballot…",
  preparing: false,
};
describe("Independent ballot and mask status", () => {
  test("a prepared handoff shows only completed masks and their own receipts", () => {
    const html = renderToStaticMarkup(<MaskSubmissionSummary receipts={[maskHash, null]} />);
    expect(html).toContain("2 masks submitted");
    expect(html.match(/aria-label="Masks"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Mask transactions"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Your vote");
    expect(html).not.toContain("waiting");
    expect(renderToStaticMarkup(<MaskSubmissionSummary receipts={[]} />)).toBe("");
  });
  test("a confirmed mask stays next to the vote still being encrypted", () => {
    const html = renderToStaticMarkup(<SubmissionSummary {...defaults} maskReceipts={[maskHash]} />);
    expect(html).toContain("Mask submitted");
    expect(html).toContain(maskHash);
    expect(html).toContain("Submitting your vote");
    expect(html).toContain(">Yes</strong>");
    expect(html.indexOf("Mask submitted")).toBeLessThan(html.indexOf("Submitting your vote"));
    expect(html).not.toContain("Vote submitted");
  });
  test("a submitted vote stays confirmed while the optional mask is pending", () => {
    const html = renderToStaticMarkup(
      <SubmissionSummary
        {...defaults}
        activeKind="mask"
        first="vote"
        voteReceipt={{ txHash: voteHash, option: 0 }}
        detail="Encrypting mask…"
      />
    );
    expect(html).toContain("Vote submitted");
    expect(html).toContain("Submitting mask");
    expect(html).toContain(voteHash);
    expect(html).not.toContain("Mask submitted");
  });
  test("one completed mask does not finish a three-mask run", () => {
    const html = renderToStaticMarkup(
      <SubmissionSummary
        {...defaults}
        includeVote={false}
        activeKind="mask"
        maskReceipts={[maskHash]}
        maskRun={{ total: 3, current: 1, sent: 1 }}
        detail="Encrypting mask…"
      />
    );
    expect(html).toContain("Mask 2 of 3");
    expect(html).toContain("1 of 3 confirmed");
    expect(html).toContain('aria-label="Mask 2: In progress"');
    expect(html).toContain('aria-label="Mask 3: Waiting"');
    expect(html).toContain('data-state="pending"');
    expect(html).not.toContain("3 masks submitted");
    expect(html).not.toContain("ui-success-banner");
  });
  test("an unavailable change-vote action is absent", () => {
    expect(renderToStaticMarkup(<VoteChangeAction disabled votingClosed={false} onChange={() => {}} />)).toBe("");
    expect(renderToStaticMarkup(<VoteChangeAction disabled={false} votingClosed onChange={() => {}} />)).toBe("");
  });
  test.each([0, 1])("a stopped three-mask run shows the vote and only the %i submitted masks", (sent) => {
    const html = renderToStaticMarkup(<SubmissionSummary
      {...defaults}
      busy={false}
      activeKind="mask"
      first="vote"
      voteReceipt={{ txHash: voteHash, option: 0 }}
      maskReceipts={sent ? [maskHash] : []}
      maskRun={{ total: 3, current: sent, sent }}
    />);
    expect(html).toContain("Vote submitted");
    expect(html).toContain(voteHash);
    expect(html).toContain(sent ? "1 of 3 masks submitted" : "Masks not submitted");
    expect(html).toContain('data-kind="mask" data-state="incomplete"');
    expect(html.includes(maskHash)).toBe(sent > 0);
    expect(html).not.toContain("Starts after");
  });
  test("a confirmed No is labelled as the vote choice, with editing inside the success state", () => {
    const html = renderToStaticMarkup(<SubmissionSummary
      {...defaults}
      busy={false}
      includeMask={false}
      voteReceipt={{ txHash: voteHash, option: 1 }}
      option="No"
      voteAction={<VoteChangeAction disabled={false} votingClosed={false} onChange={() => {}} />}
    />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Vote submitted");
    expect(html).toMatch(/Your vote:<\/span>\s*<strong>No<\/strong>/);
    expect(html).toContain("Change vote");
    expect(html).toContain(voteHash);
    expect(html).not.toContain("Masks only");
    expect(html).not.toContain("vp-confirmation-option");
  });
});
