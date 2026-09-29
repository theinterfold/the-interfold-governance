import { describe, expect, test } from "bun:test";
import {
  decideCommitmentStep,
  waitForCommitmentDecision,
  type VoteResponse,
} from "@/plugins/crispVoting/utils/commitmentDecision";

/**
 * The vote flow follows the CRISP server's choice of sender, and the wallet submits the SERVER'S
 * attested payload exactly once.
 *
 * In the relayed state the server fills BOTH `tx_hash` and `encoded_proof`: the payload is only a
 * fallback for a client that wants the wallet path after a relay failure. A client that reaches
 * for `encoded_proof` first sends a second commitment of the same statement and gets
 * `InputAlreadyCommitted`.
 */

const ATTESTED = `0x${"ab".repeat(64)}`;
const RELAY_TX = "0xb2ed8f25bf95d2c8426c889caa50b76752c0eb2b25ec3f49ab8b2f9d7175c5cc";

const view = (over: Partial<VoteResponse>): VoteResponse => ({
  status: "ready_for_commitment",
  tx_hash: null,
  message: null,
  encoded_proof: null,
  job_id: "job-1",
  ...over,
});

describe("decideCommitmentStep", () => {
  test("ready_for_commitment sends the server's attested payload from the wallet", () => {
    expect(decideCommitmentStep(view({ encoded_proof: ATTESTED }))).toEqual({ action: "submit", payload: ATTESTED });
  });

  test("a relayed job is committed, although its payload is present", () => {
    const relayed = view({ status: "pending_availability", tx_hash: RELAY_TX, encoded_proof: ATTESTED });
    expect(decideCommitmentStep(relayed)).toEqual({ action: "committed", txHash: RELAY_TX });
  });

  test("a job without a chosen sender is followed, not failed", () => {
    expect(decideCommitmentStep(view({ status: "pending_commitment" }))).toEqual({ action: "wait", jobId: "job-1" });
    expect(decideCommitmentStep(view({ status: "pending_commitment", job_id: null })).action).toBe("error");
  });

  test("a commitment that the server did not send is committed without a hash", () => {
    expect(decideCommitmentStep(view({ status: "pending_availability" }))).toEqual({
      action: "committed",
      txHash: null,
    });
    expect(decideCommitmentStep(view({ status: "success", tx_hash: RELAY_TX }))).toEqual({
      action: "committed",
      txHash: RELAY_TX,
    });
  });

  test("a failed job reports the server's own message", () => {
    const failed = view({ status: "failed_broadcast", message: "the input proof commitment deadline passed" });
    expect(decideCommitmentStep(failed)).toEqual({
      action: "error",
      reason: "the input proof commitment deadline passed",
    });
  });

  test("ready_for_commitment without a payload is an error, never an empty send", () => {
    expect(decideCommitmentStep(view({ encoded_proof: null })).action).toBe("error");
  });
});

describe("waitForCommitmentDecision", () => {
  const fast = { pollMs: 0, waitMs: 1_000 };

  test("returns the first view that names a sender, past failed reads", async () => {
    const answers = [view({ status: "pending_commitment" }), undefined, view({ encoded_proof: ATTESTED })];
    const decided = await waitForCommitmentDecision("job-1", async () => answers.shift(), () => false, fast);
    expect(decided).toEqual(view({ encoded_proof: ATTESTED }));
  });

  test("stops when the server does not know the job", async () => {
    expect(await waitForCommitmentDecision("job-1", async () => null, () => false, fast)).toBeNull();
  });

  test("gives up when the wait ends and when the page is gone", async () => {
    const pending = async () => view({ status: "pending_commitment" });
    expect(await waitForCommitmentDecision("job-1", pending, () => false, { pollMs: 0, waitMs: 0 })).toBeUndefined();
    expect(await waitForCommitmentDecision("job-1", pending, () => true, fast)).toBeUndefined();
  });
});
