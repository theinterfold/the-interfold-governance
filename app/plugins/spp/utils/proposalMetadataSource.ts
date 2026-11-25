import type { QueryClient } from "@tanstack/react-query";
import { fromHex, isAddress, isHex, type Address, type Hex } from "viem";

export function sppMetadataKey(chainId: number, processor: Address, id: bigint) {
  return ["spp-proposal-metadata", chainId, processor, id.toString()] as const;
}

/** A creation event already identifies the document, independently of the current voting stage. */
export function decodeMetadataSource(event?: { metadata?: Hex; creator?: string }) {
  if (!event?.creator || !isAddress(event.creator, { strict: false }) || !isHex(event.metadata)) return;
  if (event.metadata.length % 2 !== 0) return;
  const metadataUri = fromHex(event.metadata, "string").trim();
  if (metadataUri) return { metadataUri, creator: event.creator };
}

export function rememberProposalSource(
  client: QueryClient,
  chainId: number,
  processor: Address,
  id: bigint,
  event?: { metadata?: Hex; creator?: string }
) {
  const key = sppMetadataKey(chainId, processor, id);
  if (client.getQueryData(key)) return;
  const source = decodeMetadataSource(event);
  if (source) client.setQueryData(key, source);
}
