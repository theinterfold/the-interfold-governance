import { describe, expect, test } from "bun:test";
import { e3Lifecycle, hasPublishedTally } from "../plugins/crispVoting/utils/e3Lifecycle";
import { E3Stage } from "../plugins/crispVoting/hooks/useE3Status";
import { proposalPresentation } from "../plugins/governance/utils/proposalPresentation";

const window = { inputStartMs: 1000, inputEndMs: 3000 };
const votingEndMs = 2000;
describe("E3 network progress", () => {
  test("SDK completion cannot stop network reads until the tally is available", () => {
    expect(hasPublishedTally([], true)).toBe(false);
    expect(hasPublishedTally([0n, 0n, 0n], false)).toBe(false);
    expect(hasPublishedTally([0n, 0n, 0n], true)).toBe(true);
    expect(hasPublishedTally([1n, 0n, 0n], false)).toBe(true);
  });
  test("request and committee milestones identify the next pending operation", () => {
    const requested = e3Lifecycle({ stage: E3Stage.Requested });
    expect(requested.steps.map((s) => s.state)).toEqual([
      "complete",
      "current",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
    const keygen = e3Lifecycle({ stage: E3Stage.CommitteeFinalized });
    expect(keygen.phase).toBe("Key generation");
    expect(keygen.steps[1].state).toBe("complete");
    expect(keygen.steps[2].state).toBe("current");
  });
  test("the E3 window, not the shorter voting deadline, gates Compute", () => {
    const dates = window;
    const atVoteClose = e3Lifecycle({ stage: E3Stage.KeyPublished, ...dates, nowMs: votingEndMs });
    expect(atVoteClose.phase).toBe("Input window");
    expect(atVoteClose.currentStep).toBe(4);
    expect(atVoteClose.steps[4].state).toBe("pending");
    expect(e3Lifecycle({ stage: E3Stage.KeyPublished, ...dates, nowMs: dates.inputEndMs - 1 }).phase).toBe(
      "Input window"
    );
    const afterClose = e3Lifecycle({ stage: E3Stage.KeyPublished, ...dates, nowMs: dates.inputEndMs });
    expect(afterClose.phase).toBe("Compute");
    expect(afterClose.currentStep).toBe(5);
    expect(afterClose.description).toContain("Awaiting the encrypted tally");
    expect(afterClose.steps[3].state).toBe("complete");
    expect(afterClose.steps[5].state).toBe("pending");
  });
  test("a ready key before input opening does not imply voting is open", () => {
    const progress = e3Lifecycle({ stage: E3Stage.KeyPublished, ...window, nowMs: 500 });
    expect(progress.phase).toBe("Input window");
    expect(progress.description).toContain("has not opened");
  });
  test("ciphertext publication confirms Compute, while decryption is still pending", () => {
    const progress = e3Lifecycle({ stage: E3Stage.CiphertextReady });
    expect(progress.phase).toBe("Decryption");
    expect(progress.currentStep).toBe(6);
    expect(progress.steps[4].state).toBe("complete");
    expect(progress.steps[5].state).toBe("current");
    expect(progress.steps[6].state).toBe("pending");
    expect(progress.published).toBe(false);
  });
  test("published evidence wins over a stale timeout, without asserting governance passage", () => {
    for (const evidence of [{ stage: E3Stage.Complete }, { hasTally: true }]) {
      const progress = e3Lifecycle({ ...evidence, failed: true });
      expect(progress.published).toBe(true);
      expect(progress.currentStep).toBe(7);
      expect(progress.steps.every((s) => s.state === "complete")).toBe(true);
    }
    const view = proposalPresentation({
      startMs: 1,
      endMs: 2,
      nowMs: 3,
      isTallied: false,
      networkResultPublished: true,
    });
    expect(view.label).toBe("Confirming result");
    expect(view.votingOpen).toBe(false);
    expect(view.showTally).toBe(false);
    expect(view.resultMessage).toContain("published");
  });
  test("missing, unknown or invalid timing never invents Compute", () => {
    for (const stage of [undefined, E3Stage.None, 99]) {
      const progress = e3Lifecycle({ stage, ...window, nowMs: 9000 });
      expect(progress.phase).toBe("Status unavailable");
      expect(progress.currentStep).toBeUndefined();
      expect(progress.steps.every((s) => s.state === "unknown")).toBe(true);
    }
    for (const timing of [{}, { inputStartMs: 500, inputEndMs: 100 }]) {
      const progress = e3Lifecycle({ stage: E3Stage.KeyPublished, ...timing, nowMs: 9000 });
      expect(progress.phase).toBe("Status unavailable");
      expect(progress.currentStep).toBeUndefined();
      expect(progress.steps[2].state).toBe("complete");
      expect(progress.steps[4].state).toBe("unknown");
    }
  });
  test("a failed round never has a current healthy operation", () => {
    for (const evidence of [{ stage: E3Stage.Failed }, { stage: E3Stage.KeyPublished, failed: true }]) {
      const progress = e3Lifecycle({ ...evidence, ...window, nowMs: 9000 });
      expect(progress.phase).toBe("Round failed");
      expect(progress.currentStep).toBeUndefined();
      expect(progress.steps.some((s) => s.state === "current")).toBe(false);
      expect(progress.published).toBe(false);
    }
  });
});
