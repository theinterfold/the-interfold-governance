import { http, createConfig } from "wagmi";
import { fallback } from "viem";
import { getDefaultConfig } from "connectkit";
import {
  PUB_APP_DESCRIPTION,
  PUB_APP_NAME,
  PUB_CHAIN,
  PUB_PROJECT_URL,
  PUB_WALLET_CONNECT_PROJECT_ID,
  PUB_WALLET_ICON,
  PUB_RPC_BATCH_SIZE,
  PUB_WEB3_ENDPOINT,
  PUB_WEB3_FALLBACK_ENDPOINT,
} from "@/constants";

/**
 * How every client in the app reads the chain: the wagmi config below and the plain viem clients.
 *
 * The primary endpoint is usually the CRISP server's indexer-backed route, which answers only for
 * the contracts it indexes and rejects everything else with `Address not served by this indexer`.
 * viem's `fallback` retries such a call on the next transport (its `shouldThrow` stops only at
 * reverts and user rejections), so a read of an address discovered on chain — the escrow's exit
 * queue, lock NFT or IVotes adapter — lands on the generic relay instead of failing. A read that
 * the server refuses with 429 also moves to the relay at once: inside `fallback` each transport
 * tries once, so the rate-limited server sees the call again only if the relay fails too.
 * Batching stays per-transport, so only the refused call is retried, not its batch.
 */
export const readTransport = PUB_WEB3_FALLBACK_ENDPOINT
  ? fallback([
      http(PUB_WEB3_ENDPOINT, { batch: { batchSize: PUB_RPC_BATCH_SIZE } }),
      http(PUB_WEB3_FALLBACK_ENDPOINT, { batch: { batchSize: PUB_RPC_BATCH_SIZE } }),
    ])
  : http(PUB_WEB3_ENDPOINT, { batch: { batchSize: PUB_RPC_BATCH_SIZE } });

export const config = createConfig(
  getDefaultConfig({
    appName: PUB_APP_NAME,
    appDescription: PUB_APP_DESCRIPTION,
    appUrl: typeof window === "undefined" ? PUB_PROJECT_URL : window.location.origin,
    appIcon: PUB_WALLET_ICON,
    walletConnectProjectId: PUB_WALLET_CONNECT_PROJECT_ID,
    enableFamily: false,
    // Wallet transports belong to the browser. Server rendering only reads chain data.
    connectors: typeof window === "undefined" ? [] : undefined,
    chains: [PUB_CHAIN],
    ssr: true,
    transports: { [PUB_CHAIN.id]: readTransport },
  })
);
