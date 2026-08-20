import type { AbiEvent } from "viem";
import type { PublicClient } from "viem";

// Chunk size for providers that cap eth_getLogs ranges. Only used on the fallback path.
const CHUNK = 9_000n;

type ScanParams = {
  address: `0x${string}`;
  event: AbiEvent;
  args?: Record<string, unknown>;
};

/**
 * Scans logs from `fromBlock` to the head, trying ONE full-range request first — archive
 * providers (Alchemy, Infura, drpc) accept arbitrary ranges when the result set is small, and
 * a single request is ~30x faster than the chunked walk when it goes through the /api/rpc
 * relay (each chunk pays a serverless + upstream roundtrip). Providers that cap the range
 * reject the full request, and the scan falls back to sequential CHUNK-sized windows.
 */
export async function scanLogs(client: PublicClient, params: ScanParams, fromBlock: bigint) {
  const latest = await client.getBlockNumber();
  const { address, event } = params;
  const args = params.args as undefined;

  try {
    return await client.getLogs({ address, event, args, fromBlock, toBlock: latest });
  } catch {
    // Range-capped provider — walk it in chunks instead.
  }

  const logs = [];
  for (let from = fromBlock; from <= latest; from += CHUNK + 1n) {
    const to = from + CHUNK > latest ? latest : from + CHUNK;
    logs.push(...(await client.getLogs({ address, event, args, fromBlock: from, toBlock: to })));
  }
  return logs;
}
