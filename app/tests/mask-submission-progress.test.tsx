import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MaskSubmissionProgress } from "../components/proposalVoting/maskSubmissionProgress";

describe("Mask submission progress", () => {
  test("ten segments retain partial confirmations when the current mask fails", () => {
    const html = renderToStaticMarkup(<MaskSubmissionProgress total={10} confirmed={5} current={5} failed />);
    expect(html).toContain("5 of 10 confirmed");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html.match(/data-state="confirmed"/g)).toHaveLength(5);
    expect(html.match(/data-state="waiting"/g)).toHaveLength(4);
    expect(html).toContain('data-state="error"');
  });
  test("distinguishes the working mask from the waiting queue before any confirmation", () => {
    const html = renderToStaticMarkup(<MaskSubmissionProgress total={2} confirmed={0} current={0} />);
    expect(html).toContain("0 of 2 confirmed");
    expect(html).toContain('data-state="current" aria-current="step"');
    expect(html).toContain('data-state="waiting"');
    expect(html).not.toContain('data-state="confirmed"');
    expect(html).not.toContain("0%");
  });

  test("preserves confirmed masks if the next one fails", () => {
    const html = renderToStaticMarkup(<MaskSubmissionProgress total={3} confirmed={1} current={1} failed />);
    expect(html).toContain("1 of 3 confirmed");
    expect(html.match(/data-state="confirmed"/g)).toHaveLength(1);
    expect(html).toContain('data-state="error" aria-current="step"');
    expect(html).toContain("Needs attention");
    expect(html).toContain('data-state="waiting"');
  });

  test("marks completion from confirmations and omits a redundant single-mask index", () => {
    const html = renderToStaticMarkup(<MaskSubmissionProgress total={2} confirmed={2} current={1} />);
    expect(html.match(/data-state="confirmed"/g)).toHaveLength(2);
    expect(html).not.toContain('aria-current="step"');
    expect(renderToStaticMarkup(<MaskSubmissionProgress total={1} confirmed={0} current={0} />)).toBe("");
  });
});
