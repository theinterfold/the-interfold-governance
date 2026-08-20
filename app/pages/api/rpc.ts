import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Server-side JSON-RPC relay, so the RPC endpoint (and its API key) never ships in the client
 * bundle (INV-27). The browser's viem clients point at this route; the real endpoint lives in
 * the server-only WEB3_RPC_URL. Wallet transactions are unaffected — wallets broadcast through
 * their own RPC; only the app's reads and estimations pass through here.
 */

// Read-path JSON-RPC only. Everything wagmi/viem's public clients need is eth_/net_/web3_;
// anything else (admin_, debug_, ...) has no business being relayed with our key.
const ALLOWED_PREFIXES = ["eth_", "net_", "web3_"];

type RpcCall = { jsonrpc?: string; method?: string };

function methodsAllowed(body: unknown): boolean {
  const calls: RpcCall[] = Array.isArray(body) ? body : [body as RpcCall];
  return calls.every(
    (c) => typeof c?.method === "string" && ALLOWED_PREFIXES.some((p) => (c.method as string).startsWith(p))
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const upstream = process.env.WEB3_RPC_URL;
  if (!upstream) {
    return res.status(500).json({ error: "WEB3_RPC_URL is not configured on the server" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Browsers attach an Origin header to cross-site POSTs; refusing a mismatch stops other
  // websites from riding this relay from their visitors' browsers. (Non-browser callers can
  // still reach it, like any public read endpoint — keep provider-side rate limits on.)
  const origin = req.headers.origin;
  if (origin && req.headers.host && new URL(origin).host !== req.headers.host) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!methodsAllowed(req.body)) {
    return res.status(400).json({ error: "Unsupported JSON-RPC method" });
  }

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const payload = await response.text();
    res.status(response.status).setHeader("content-type", "application/json").send(payload);
  } catch {
    res.status(502).json({ error: "Upstream RPC unreachable" });
  }
}
