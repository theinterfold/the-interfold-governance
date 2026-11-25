import { describe, expect, test } from "bun:test";
import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from "viem";
import {
  broadcastSubmission,
  createPendingSubmissionStore,
  readSubmission,
  submissionJobId,
  type PendingSubmission,
} from "../plugins/crispVoting/utils/pendingSubmission";
import { submitBallotSequence, submitMaskSequence } from "../plugins/crispVoting/utils/ballotSubmission";

const voter = ("0x" + "11".repeat(20)) as Hex;
const plugin = ("0x" + "22".repeat(20)) as Hex;
const scope = { chainId: 1, plugin, voter, roundId: 42n };
const envelope = (proof: Hex = "0x1234", slot: Hex = voter, ciphertext: Hex = "0xaabb") =>
  encodeAbiParameters(parseAbiParameters("bytes, address, bytes32, bytes32, uint40, bytes"), [
    proof,
    slot,
    ("0x" + "33".repeat(32)) as Hex,
    keccak256(ciphertext),
    7,
    ciphertext,
  ]);
const submission = (kind: "vote" | "mask" = "vote"): PendingSubmission => {
  const encoded_proof = envelope("0x1234", kind === "mask" ? plugin : voter);
  return {
    jobId: submissionJobId("42", encoded_proof),
    kind,
    prepare: false,
    request: { round_id: "42", encoded_proof, address: kind === "mask" ? plugin : voter, send_from_wallet: false },
  };
};
const storage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};
const fetcher = (run: (...args: Parameters<typeof fetch>) => Promise<Response>) => run as typeof fetch;
const view = (pending: PendingSubmission, status = "success") => ({
  job_id: pending.jobId,
  status,
  tx_hash: null,
  message: null,
});

describe("unfinished encrypted ballot recovery", () => {
  test("job identity is stable for a proof retry but changes for another statement or round", () => {
    expect(submissionJobId("0042", envelope("0x9876"))).toBe(submissionJobId("42", envelope()));
    expect(submissionJobId("43", envelope())).not.toBe(submissionJobId("42", envelope()));
    expect(submissionJobId("42", envelope("0x1234", plugin))).not.toBe(submissionJobId("42", envelope()));
    expect(submissionJobId("42", envelope("0x1234", voter, "0xdddd"))).not.toBe(submissionJobId("42", envelope()));
  });
  test("reload restores exact retry material, without recording a plaintext vote or weight", () => {
    const disk = storage(),
      pending = submission();
    createPendingSubmissionStore(() => disk).save(scope, pending);
    const restored = createPendingSubmissionStore(() => disk).get(scope);
    expect(restored?.request).toEqual(pending.request);
    expect(restored?.jobId).toBe(pending.jobId);
    expect(Object.keys(JSON.parse([...disk.values.values()][0])).sort()).toEqual([
      "jobId",
      "kind",
      "prepare",
      "request",
      "version",
    ]);
    expect(Object.keys(restored!.request).sort()).toEqual(["address", "encoded_proof", "round_id", "send_from_wallet"]);
  });
  test("one pending ballot prevents a second ballot; other accounts, rounds and chains remain independent", () => {
    const disk = storage(),
      store = createPendingSubmissionStore(() => disk);
    store.save(scope, submission());
    expect(() => store.save(scope, submission())).toThrow("unfinished");
    expect(store.get({ ...scope, voter: plugin })).toBeUndefined();
    expect(store.get({ ...scope, roundId: 43n })).toBeUndefined();
    expect(store.get({ ...scope, chainId: 11155111 })).toBeUndefined();
    expect(store.get({ ...scope, plugin: voter })).toBeUndefined();
  });
  test("a mask remains scoped to its submitting wallet, not its target", () => {
    const disk = storage();
    createPendingSubmissionStore(() => disk).save(scope, submission("mask"));
    expect(createPendingSubmissionStore(() => disk).get(scope)?.kind).toBe("mask");
    expect(createPendingSubmissionStore(() => disk).get({ ...scope, voter: plugin })).toBeUndefined();
  });
  test("success removes encrypted retry material, while an old job cannot remove a newer job", () => {
    const disk = storage(),
      store = createPendingSubmissionStore(() => disk),
      pending = submission();
    store.save(scope, pending);
    store.remove(scope, { ...pending, jobId: "another-job" });
    expect(store.get(scope)).toBe(pending);
    store.remove(scope, pending);
    expect(disk.values.size).toBe(0);
    expect(createPendingSubmissionStore(() => disk).get(scope)).toBeUndefined();
  });
  test("a known wallet transaction is retained across reload before its receipt arrives", () => {
    const disk = storage(),
      store = createPendingSubmissionStore(() => disk),
      pending = submission();
    const hash = ("0x" + "ab".repeat(32)) as Hex;
    store.save(scope, pending);
    store.markSent(scope, pending, hash);
    expect(createPendingSubmissionStore(() => disk).get(scope)?.transactionHash).toBe(hash);
    store.markSent(scope, pending, undefined);
    expect(createPendingSubmissionStore(() => disk).get(scope)?.transactionHash).toBeUndefined();
  });
  test("unavailable or full storage refuses staging before any POST", () => {
    expect(() => createPendingSubmissionStore(() => undefined).save(scope, submission())).toThrow("storage");
    const disk = storage();
    disk.setItem = () => {
      throw new Error("quota");
    };
    expect(() => createPendingSubmissionStore(() => disk).save(scope, submission())).toThrow("quota");
  });
  test("corrupt or mismatched saved material blocks a new vote rather than forgetting the uncertain one", () => {
    const disk = storage();
    createPendingSubmissionStore(() => disk).save(scope, submission());
    const key = [...disk.values.keys()][0];
    const saved = JSON.parse(disk.getItem(key)!);
    disk.setItem(key, JSON.stringify({ ...saved, jobId: "wrong" }));
    expect(() => createPendingSubmissionStore(() => disk).get(scope)).toThrow();
    disk.setItem(key, "{bad");
    expect(() => createPendingSubmissionStore(() => disk).get(scope)).toThrow();
  });
});

describe("ambiguous broadcast responses", () => {
  test("a lost POST response is unknown; reload can recover the same accepted job with GET only", async () => {
    const disk = storage(),
      pending = submission(),
      sent: string[] = [];
    createPendingSubmissionStore(() => disk).save(scope, pending);
    const answer = await broadcastSubmission(
      "/api",
      pending.request,
      fetcher(async (_url, init) => {
        sent.push(init!.body as string);
        throw new TypeError("connection lost after accepting the ballot");
      })
    );
    expect(answer.kind).toBe("unknown");
    const restored = createPendingSubmissionStore(() => disk).get(scope)!;
    const recovered = await readSubmission(
      "/api",
      restored.jobId,
      fetcher(async (url, init) => {
        expect(String(url)).toContain(restored.jobId);
        expect(init!.method).toBeUndefined();
        expect(init!.cache).toBe("no-store");
        return Response.json(view(restored));
      })
    );
    expect(recovered?.status).toBe("success");
    expect(sent).toEqual([JSON.stringify(restored.request)]);
  });
  test("a missing job allows an identical retry, never a new random weight or signature", async () => {
    const disk = storage(),
      pending = submission(),
      sent: string[] = [];
    createPendingSubmissionStore(() => disk).save(scope, pending);
    const send = fetcher(async (_url, init) => {
      sent.push(init!.body as string);
      if (sent.length === 1) throw new TypeError("request never arrived");
      return Response.json(view(pending));
    });
    expect((await broadcastSubmission("/api", pending.request, send)).kind).toBe("unknown");
    const restored = createPendingSubmissionStore(() => disk).get(scope)!;
    expect(
      await readSubmission(
        "/api",
        restored.jobId,
        fetcher(async () => new Response("", { status: 404 }))
      )
    ).toBeNull();
    expect((await broadcastSubmission("/api", restored.request, send)).kind).toBe("accepted");
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(sent[1]);
  });
  for (const status of [408, 500, 502, 503, 504]) {
    test(`HTTP ${status} cannot prove that the vote was rejected`, async () => {
      expect(
        (
          await broadcastSubmission(
            "/api",
            submission().request,
            fetcher(async () => new Response("", { status }))
          )
        ).kind
      ).toBe("unknown");
    });
  }
  test("malformed or mismatched success is unknown, not a receipt", async () => {
    for (const response of [
      () => new Response("not json"),
      () => Response.json({ status: "success", job_id: "wrong" }),
    ]) {
      expect(
        (
          await broadcastSubmission(
            "/api",
            submission().request,
            fetcher(async () => response())
          )
        ).kind
      ).toBe("unknown");
    }
    expect(
      await readSubmission(
        "/api",
        submission().jobId,
        fetcher(async () => Response.json({ status: "success", job_id: "wrong" }))
      )
    ).toBeUndefined();
  });
  test("a first request's explicit client rejection is distinct from an uncertain response", async () => {
    const answer = await broadcastSubmission(
      "/api",
      submission().request,
      fetcher(async () => Response.json({ error: "Invalid ballot" }, { status: 400 }))
    );
    expect(answer.kind).toBe("rejected");
  });
  test("a timed out request is unknown", async () => {
    const answer = await broadcastSubmission(
      "/api",
      submission().request,
      fetcher(
        async (_url, init) =>
          new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("timeout"))))
      ),
      1
    );
    expect(answer.kind).toBe("unknown");
  });
  test("uncertainty stops all remaining vote/mask steps", async () => {
    const events: string[] = [];
    const unknown = { success: false as const, uncertain: true, error: "Check status" };
    await submitBallotSequence({
      vote: async () => {
        events.push("vote");
        return unknown;
      },
      masks: [
        async () => {
          events.push("mask");
          return { success: true, txHash: null };
        },
      ],
      isCurrent: () => true,
      onStart: () => {},
      onResult: () => {},
    });
    expect(events).toEqual(["vote"]);
    events.length = 0;
    await submitMaskSequence({
      masks: [
        async () => {
          events.push("first");
          return unknown;
        },
        async () => {
          events.push("second");
          return { success: true, txHash: null };
        },
      ],
      isCurrent: () => true,
      onStart: () => {},
      onResult: () => {},
    });
    expect(events).toEqual(["first"]);
  });
});
