import { describe, expect, test } from "bun:test";
import { isTagUsed, retryingStagingFetch } from "../plugins/crispVoting/utils/aztec/stagingRetry";

const UNKNOWN_ROOT = "The staging pass names a census root this round has not had";
const TAG_USED = "The staging pass was already used";
const respond = (status: number, body = "") => new Response(body, { status });

const run = async (answer: (attempt: number) => Response) => {
  const sent: unknown[] = [];
  const waits: number[] = [];
  const send = (async (_input: unknown, init?: RequestInit) => {
    sent.push(init?.body);
    return answer(sent.length - 1);
  }) as unknown as typeof fetch;
  const fetchStaging = retryingStagingFetch(
    send,
    (_retry, delay) => void waits.push(delay),
    async () => undefined
  );
  const response = await fetchStaging("https://server/voting/remote-input", { method: "POST", body: "the-same-pass" });
  return { response, sent, waits };
};

describe("the staging fetch", () => {
  test("sends the same request again while the root is unknown, with a growing delay, then returns the acceptance", async () => {
    const { response, sent, waits } = await run((attempt) => (attempt < 3 ? respond(400, UNKNOWN_ROOT) : respond(200, "{}")));
    expect(response.status).toBe(200);
    expect(sent).toEqual(["the-same-pass", "the-same-pass", "the-same-pass", "the-same-pass"]);
    expect(waits).toEqual([3_000, 6_000, 12_000]);
  });

  test("gives the unknown-root answer back once three minutes of waiting have passed", async () => {
    const { response, waits } = await run(() => respond(400, UNKNOWN_ROOT));
    expect(response.status).toBe(400);
    expect(Math.max(...waits)).toBe(15_000);
    expect(waits.reduce((sum, delay) => sum + delay, 0)).toBe(180_000);
  });

  test.each([
    ["a used tag, for the caller to take the next counter", TAG_USED],
    ["any other refusal", "The staging pass proof is invalid"],
  ])("returns %s at once", async (_name, body) => {
    const { response, sent } = await run(() => respond(400, body));
    expect(await response.text()).toBe(body);
    expect(sent).toHaveLength(1);
  });
});

test("a used tag is recognised in the error the SDK throws for a 400", () => {
  expect(isTagUsed(new Error(`CRISP server input staging failed (400): ${TAG_USED}`))).toBe(true);
  expect(isTagUsed(new Error(`CRISP server input staging failed (400): ${UNKNOWN_ROOT}`))).toBe(false);
});
