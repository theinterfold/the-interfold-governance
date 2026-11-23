import { describe, expect, test } from "bun:test";
import {
  STAGING_RETRY_WINDOW_MS,
  TAG_USED,
  UNKNOWN_ROOT,
  classifyStagingAnswer,
  classifyStagingError,
  nextStagingStep,
  retryingStagingFetch,
} from "../plugins/crispVoting/utils/aztec/stagingRetry";

describe("what the server's answer to a staging request means", () => {
  test("a 2xx is accepted", () => {
    expect(classifyStagingAnswer(200, "")).toBe("accepted");
    expect(classifyStagingAnswer(202, "")).toBe("accepted");
  });

  test("an unknown root and a used tag are told apart by the server's message", () => {
    expect(classifyStagingAnswer(400, `{"message":"${UNKNOWN_ROOT}"}`)).toBe("unknown-root");
    expect(classifyStagingAnswer(400, `{"message":"${TAG_USED}"}`)).toBe("tag-used");
  });

  test("anything else is a refusal, even with the same words under another status", () => {
    expect(classifyStagingAnswer(400, "The staging pass proof is invalid")).toBe("refused");
    expect(classifyStagingAnswer(500, UNKNOWN_ROOT)).toBe("refused");
    expect(classifyStagingAnswer(429, "slow down")).toBe("refused");
  });

  test("reads the error the SDK throws for a 400", () => {
    expect(classifyStagingError(new Error(`CRISP server input staging failed (400): ${TAG_USED}`))).toBe("tag-used");
    expect(classifyStagingError(new Error(`CRISP server input staging failed (500): ${TAG_USED}`))).toBe("refused");
    expect(classifyStagingError("nope")).toBe("refused");
  });
});

describe("what to do with an answer", () => {
  test("an unknown root is retried with the same pass, with a growing delay", () => {
    expect(nextStagingStep("unknown-root", 0, 0)).toEqual({ kind: "retry-same-pass", delayMs: 3_000 });
    expect(nextStagingStep("unknown-root", 1, 3_000)).toEqual({ kind: "retry-same-pass", delayMs: 6_000 });
    expect(nextStagingStep("unknown-root", 10, 60_000)).toEqual({ kind: "retry-same-pass", delayMs: 15_000 });
  });

  test("the last delay stops at the end of the window, and then the retries stop", () => {
    expect(nextStagingStep("unknown-root", 5, STAGING_RETRY_WINDOW_MS - 1_000)).toEqual({ kind: "retry-same-pass", delayMs: 1_000 });
    expect(nextStagingStep("unknown-root", 6, STAGING_RETRY_WINDOW_MS)).toEqual({ kind: "stop" });
  });

  test("a used tag moves to the next counter, an accepted request is done, other refusals stop", () => {
    expect(nextStagingStep("tag-used", 0, 0)).toEqual({ kind: "next-counter" });
    expect(nextStagingStep("accepted", 3, 10_000)).toEqual({ kind: "accept" });
    expect(nextStagingStep("refused", 0, 0)).toEqual({ kind: "stop" });
  });
});

describe("the staging fetch", () => {
  const respond = (status: number, body = "") => new Response(body, { status });
  const run = async (answers: Response[], clock = () => 0) => {
    const sent: unknown[] = [];
    const waits: number[] = [];
    const send = (async (_input: unknown, init?: RequestInit) => {
      sent.push(init?.body);
      return answers.shift()!;
    }) as unknown as typeof fetch;
    const fetchStaging = retryingStagingFetch(send, {
      onWait: (_retry, delay) => void waits.push(delay),
      sleep: async () => undefined,
      now: clock,
    });
    const response = await fetchStaging("https://server/voting/remote-input", { method: "POST", body: "the-same-pass" });
    return { response, sent, waits };
  };

  test("sends the same request again while the root is unknown, then returns the acceptance", async () => {
    const { response, sent, waits } = await run([respond(400, UNKNOWN_ROOT), respond(400, UNKNOWN_ROOT), respond(200, "{}")]);
    expect(response.status).toBe(200);
    expect(sent).toEqual(["the-same-pass", "the-same-pass", "the-same-pass"]);
    expect(waits).toEqual([3_000, 6_000]);
  });

  test("returns a used tag at once, for the caller to take the next counter", async () => {
    const { response, sent } = await run([respond(400, TAG_USED), respond(200)]);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe(TAG_USED);
    expect(sent).toHaveLength(1);
  });

  test("returns any other refusal at once", async () => {
    const { response, sent } = await run([respond(400, "The staging pass proof is invalid"), respond(200)]);
    expect(response.status).toBe(400);
    expect(sent).toHaveLength(1);
  });

  test("gives the unknown-root answer back when the window has ended", async () => {
    let time = 0;
    const { response, sent } = await run([respond(400, UNKNOWN_ROOT), respond(400, UNKNOWN_ROOT)], () => (time += STAGING_RETRY_WINDOW_MS));
    expect(response.status).toBe(400);
    expect(sent).toHaveLength(1);
  });
});
