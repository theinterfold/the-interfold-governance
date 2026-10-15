import { describe, expect, test } from "bun:test";
import {
  submitBallotSequence,
  submitMaskSequence,
  type BallotKind,
  type BallotSubmissionResult,
} from "../plugins/crispVoting/utils/ballotSubmission";
import { pickMaskRecipients } from "../plugins/crispVoting/utils/voters";

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

describe("Masks sent on their own", () => {
  test("sends every mask in order and stops at the first failure", async () => {
    const events: string[] = [];
    const sent: number[] = [];
    const masks = [success, failure, success].map((result, index) => async () => {
      sent.push(index);
      return result;
    });
    await submitMaskSequence({
      masks,
      isCurrent: () => true,
      onStart: (index) => events.push(`${index}`),
      onResult: (index, result) => events.push(`${index}:${result.success}`),
    });
    expect(events).toEqual(["0", "0:true", "1", "1:false"]);
    expect(sent).toEqual([0, 1]);
  });
  test("a closed view sends no further mask", async () => {
    let current = true;
    let sent = 0;
    const mask = async () => {
      sent++;
      current = false;
      return success;
    };
    await submitMaskSequence({ masks: [mask, mask], isCurrent: () => current, onStart: () => {}, onResult: () => {} });
    expect(sent).toBe(1);
  });
});

describe("Mask recipients", () => {
  const voters = ["0xa", "0xb", "0xc"].map((address) => ({ address, balance: 1n }));
  test("random masks cover different voters, and avoid a chosen wallet", () => {
    for (let round = 0; round < 50; round++) {
      const picked = pickMaskRecipients(["0xB", undefined, undefined], voters);
      expect(picked[0]).toBe("0xB");
      expect(new Set(picked.map((address) => address.toLowerCase())).size).toBe(3);
    }
  });
  test("more random masks than voters still gives every mask a recipient", () => {
    const picked = pickMaskRecipients([undefined, undefined, undefined, undefined, undefined], voters);
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(3);
  });
});
