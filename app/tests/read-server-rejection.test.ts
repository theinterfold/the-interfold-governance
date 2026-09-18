import { describe, expect, test } from "bun:test";
import { readServerRejection } from "@/plugins/crispVoting/utils/readServerRejection";

/** Builds a Response like the CRISP relay returns on a rejected broadcast. */
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("readServerRejection", () => {
  /**
   * The relay's real rejection copy. Each of these tells the voter something different about
   * whether to retry, and all of them were previously flattened to "Failed to broadcast vote".
   */
  test.each([
    [429, "Too many votes from this address, slow down"],
    [400, "The vote commitment deadline has passed"],
    [400, "Invalid hex encoded proof"],
    [503, "The availability service is temporarily unavailable"],
    [503, "The relay is busy, please try again shortly"],
  ])("surfaces the server's own message (%i)", async (status, message) => {
    const text = await readServerRejection(jsonResponse(status, { status: "FailedBroadcast", message }));
    expect(text).toBe(message);
  });

  test("accepts an 'error' field as well as 'message'", async () => {
    const text = await readServerRejection(jsonResponse(400, { error: "Ballot rejected by the verifier" }));
    expect(text).toBe("Ballot rejected by the verifier");
  });

  test("trims surrounding whitespace", async () => {
    const text = await readServerRejection(jsonResponse(400, { message: "  padded reason  " }));
    expect(text).toBe("padded reason");
  });

  /** A proxy error page or an empty 502 is not JSON; `response.json()` throws on both. */
  test("falls back to the status when the body is not JSON", async () => {
    const text = await readServerRejection(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    expect(text).toContain("502");
  });

  test("uses deliberate copy for the relay's known status codes", async () => {
    expect(await readServerRejection(new Response("", { status: 429 }))).toContain("Too many requests");
    expect(await readServerRejection(new Response("", { status: 503 }))).toContain("temporarily unavailable");
    expect(await readServerRejection(new Response("", { status: 504 }))).toContain("not recorded");
  });

  test("ignores a non-string message rather than rendering '[object Object]'", async () => {
    const text = await readServerRejection(jsonResponse(400, { message: { nested: "oops" } }));
    expect(text).not.toContain("object");
    expect(text).toContain("invalid");
  });

  test("an empty message falls through to the status copy", async () => {
    const text = await readServerRejection(jsonResponse(429, { message: "   " }));
    expect(text).toContain("Too many requests");
  });
});
