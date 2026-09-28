import { describe, expect, test } from "bun:test";
import {
  submitBallotSequence,
  type BallotKind,
  type BallotSubmissionResult,
} from "../plugins/crispVoting/utils/ballotSubmission";
import { getRandomVoterToMask, selectVoterToMask } from "../plugins/crispVoting/utils/voters";

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
});

describe("Mask recipient", () => {
  const voters = [
    { address: "0x0000000000000000000000000000000000000001", balance: 10n },
    { address: "0x0000000000000000000000000000000000000002", balance: 20n },
  ];
  test("random targets come from the eligible set", () => {
    expect(voters).toContain(selectVoterToMask(voters));
  });
  test("random recipients exclude the connected wallet", () => {
    expect(getRandomVoterToMask(voters, voters[0].address)).toEqual(voters[1]);
  });
  test("does not silently use myself when no other recipient exists", () => {
    expect(() => getRandomVoterToMask([voters[0]], voters[0].address)).toThrow("No other eligible voters");
    expect(selectVoterToMask([voters[0]], voters[0].address)).toEqual(voters[0]);
  });
  test("uses the chosen eligible wallet", () => {
    expect(selectVoterToMask(voters, voters[1].address)).toEqual(voters[1]);
  });
  test("never silently replaces an invalid or ineligible target with a random wallet", () => {
    expect(() => selectVoterToMask(voters, "bad address")).toThrow("valid wallet");
    expect(() => selectVoterToMask(voters, "0x0000000000000000000000000000000000000003")).toThrow("not eligible");
    expect(() => selectVoterToMask([])).toThrow("No eligible voters");
  });
});
