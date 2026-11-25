import { afterEach, expect, test } from "bun:test";
import { fetchFromFirstGateway } from "../utils/ipfs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const gateways = ["https://down.example/ipfs", "https://up.example/ipfs"];

test("a gateway that never answers does not hide the document another gateway serves", async () => {
  const aborted: string[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted.push(url);
        reject(new DOMException("Aborted", "AbortError"));
      });
      if (url.startsWith("https://up.example/")) resolve(new Response(JSON.stringify({ title: "IPP-001" })));
    })) as typeof fetch;

  const response = await fetchFromFirstGateway(gateways, "bafy");
  expect(await response.json()).toEqual({ title: "IPP-001" });
  // The unanswered request is cancelled once the document arrived.
  expect(aborted).toEqual(["https://down.example/ipfs/bafy"]);
});

test("a read fails only when no gateway serves the document", async () => {
  globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
  await expect(fetchFromFirstGateway(gateways, "bafy")).rejects.toThrow("Could not connect to any of the IPFS endpoints");
});
