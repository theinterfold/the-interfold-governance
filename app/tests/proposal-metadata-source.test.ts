import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { toHex } from "viem";
import { rememberProposalSource, sppMetadataKey } from "../plugins/spp/utils/proposalMetadataSource";

const privateProcessor = "0x0000000000000000000000000000000000000001";
const publicProcessor = "0x0000000000000000000000000000000000000002";
const creator = "0x0000000000000000000000000000000000000003";
const uri = "ipfs://example-document";

test("a row reuses the creation event from the list only for its own chain, processor and proposal", async () => {
  const cache = new QueryClient();
  rememberProposalSource(cache, 1, privateProcessor, 0n, { metadata: toHex(uri), creator });
  const cached = await cache.fetchQuery<{ creator: string; metadataUri: string }>({
    queryKey: sppMetadataKey(1, privateProcessor, 0n),
    staleTime: Infinity,
    queryFn: () => {
      throw new Error("unexpected second lookup");
    },
  });
  expect(cached).toEqual({ creator, metadataUri: uri });
  expect(cache.getQueryData(sppMetadataKey(11155111, privateProcessor, 0n))).toBeUndefined();
  expect(cache.getQueryData(sppMetadataKey(1, publicProcessor, 0n))).toBeUndefined();
  expect(cache.getQueryData(sppMetadataKey(1, privateProcessor, 1n))).toBeUndefined();
  cache.clear();
});

test("incomplete creation events leave the per-proposal lookup available", () => {
  const cache = new QueryClient();
  for (const event of [undefined, { creator }, { creator, metadata: "0xf" as const }, { creator, metadata: toHex(" ") }]) {
    rememberProposalSource(cache, 1, privateProcessor, 9n, event);
    expect(cache.getQueryState(sppMetadataKey(1, privateProcessor, 9n))).toBeUndefined();
  }
});
