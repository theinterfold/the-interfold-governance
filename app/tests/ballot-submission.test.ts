import { describe, expect, test } from "bun:test";
import {
  submitBallotSequence,
  type BallotKind,
  type BallotSubmissionResult,
} from "../plugins/crispVoting/utils/ballotSubmission";

const success: BallotSubmissionResult = { success: true, txHash: "0xvote" };
const failure: BallotSubmissionResult = { success: false, error: "Rejected in wallet" };

describe("Vote and optional mask", () => {
  test("the default submits only the vote", async () => {
    const events: string[] = [];
    await submitBallotSequence({
      vote: async () => success,
      isCurrent: () => true,
      onStart: (kind) => events.push(kind),
      onResult: (kind, result) => events.push(`${kind}:${result.success}`),
    });
    expect(events).toEqual(["vote", "vote:true"]);
  });
  test("records vote success before starting the mask, and preserves it on mask failure", async () => {
    const events: string[] = [];
    await submitBallotSequence({
      vote: async () => success,
      mask: async () => failure,
      isCurrent: () => true,
      onStart: (kind) => events.push(kind),
      onResult: (kind, result) => events.push(`${kind}:${result.success}`),
    });
    expect(events).toEqual(["vote", "vote:true", "mask", "mask:false"]);
  });
  test("a rejected vote never sends the optional mask", async () => {
    let masks = 0;
    await submitBallotSequence({
      vote: async () => failure,
      mask: async () => {
        masks++;
        return success;
      },
      isCurrent: () => true,
      onStart: () => {},
      onResult: () => {},
    });
    expect(masks).toBe(0);
  });
  test("a thrown failure cannot become a successful receipt or start a mask", async () => {
    const results: BallotSubmissionResult[] = [];
    await submitBallotSequence({
      vote: async () => {
        throw new Error("Connection failed");
      },
      mask: async () => {
        throw new Error("Must not be called");
      },
      isCurrent: () => true,
      onStart: () => {},
      onResult: (_, result) => results.push(result),
    });
    expect(results).toEqual([{ success: false, error: "Connection failed" }]);
  });
  test("retrying a mask does not submit the vote again", async () => {
    const kinds: BallotKind[] = [];
    await submitBallotSequence({
      mask: async () => success,
      isCurrent: () => true,
      onStart: (kind) => kinds.push(kind),
      onResult: () => {},
    });
    expect(kinds).toEqual(["mask"]);
  });
  test("stops after a wallet/view change, without attributing an old result to the new wallet", async () => {
    let current = true;
    const events: string[] = [];
    await submitBallotSequence({
      vote: async () => {
        current = false;
        return success;
      },
      mask: async () => {
        events.push("mask");
        return success;
      },
      isCurrent: () => current,
      onStart: (kind) => events.push(kind),
      onResult: (kind) => events.push(`${kind}:result`),
    });
    expect(events).toEqual(["vote"]);
  });
  test("keeps both successful transaction links distinct", async () => {
    const results: BallotSubmissionResult[] = [];
    await submitBallotSequence({
      vote: async () => success,
      mask: async () => ({ success: true, txHash: "0xmask" }),
      isCurrent: () => true,
      onStart: () => {},
      onResult: (_, result) => results.push(result),
    });
    expect(results).toEqual([success, { success: true, txHash: "0xmask" }]);
  });
  test("mask first sends the mask before the vote, and a failed mask never sends the vote", async () => {
    const events: string[] = [];
    const send = (mask: BallotSubmissionResult) =>
      submitBallotSequence({
        first: "mask",
        vote: async () => success,
        mask: async () => mask,
        isCurrent: () => true,
        onStart: (kind) => events.push(kind),
        onResult: (kind, result) => events.push(`${kind}:${result.success}`),
      });
    await send({ success: true, txHash: "0xmask" });
    expect(events).toEqual(["mask", "mask:true", "vote", "vote:true"]);
    events.length = 0;
    await send(failure);
    expect(events).toEqual(["mask", "mask:false"]);
  });
});
