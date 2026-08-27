import { PUB_CRISP_SERVER_URL } from "@/constants";

import type { Address, Hex } from "viem";

/**
 * Typed reads served by the CRISP server, with the client's own scan as the fallback.
 *
 * The server indexes these contracts' logs to run rounds, so every `getLogs` walk in this app is
 * work repeated by each client against data the server already holds — a proposal list scanned
 * from the deployment block on every page load, a delegate directory rebuilt per visitor, a vote
 * list scanned per proposal. One request replaces each of them.
 *
 * Every function here returns `null` rather than throwing, for ANY failure: no server configured,
 * the contract not served, unreachable, or an answer that does not reach back far enough to be
 * complete. Callers keep their existing scan and use it whenever `null` comes back, so nothing in
 * this file is load-bearing — the app works with the server absent, just more slowly.
 */

/** How far back an answer must reach to be trusted. */
type Coverage = { scanned_from: number };

/**
 * How patient a call is willing to be.
 *
 * Default: none. Most routes here answer from an index that is either warm or not, and a caller
 * that can scan for itself should not sit waiting. `/members/delegates` is the exception — see
 * `fetchDelegates`.
 */
type Patience = {
  /** Total tries, including the first. */
  attempts?: number;
  /** Per-try cap. A hung request must not leave the caller's spinner up for ever. */
  timeoutMs?: number;
};

/** Backoff before try N (1-indexed), in ms. Long enough for a cold scan to finish. */
const RETRY_DELAYS = [1_000, 4_000, 10_000];

/**
 * One try. `null` means "the answer is not usable"; `retry` says whether trying again could
 * change that — a timeout or a 5xx could, a 404 (`not served by this indexer`) never will, and
 * retrying it just makes a client wait to be told the same thing.
 */
async function attempt<T extends Coverage>(
  endpoint: string,
  body: unknown,
  requiredFrom: number,
  timeoutMs: number
): Promise<{ data: T | null; retry: boolean }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const response = await fetch(`${PUB_CRISP_SERVER_URL.replace(/\/$/, "")}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abort.signal,
    });

    // 5xx and 429 are states the server leaves; 4xx is a verdict on the request itself.
    if (!response.ok) return { data: null, retry: response.status >= 500 || response.status === 429 };

    const data = (await response.json()) as T;

    // Trust it only as far as it says it scanned. The server's own coverage starts wherever IT
    // began indexing, so an answer built from a shorter range is missing entries — and for a list,
    // missing entries are indistinguishable from there being none.
    if (!(data?.scanned_from <= requiredFrom)) return { data: null, retry: false };

    return { data, retry: false };
  } catch {
    // Aborted, offline, DNS, CORS — all worth another go.
    return { data: null, retry: true };
  } finally {
    clearTimeout(timer);
  }
}

async function post<T extends Coverage>(
  endpoint: string,
  body: unknown,
  requiredFrom: number,
  patience: Patience = {}
): Promise<T | null> {
  if (!PUB_CRISP_SERVER_URL || !requiredFrom) return null;

  const attempts = patience.attempts ?? 1;
  const timeoutMs = patience.timeoutMs ?? 15_000;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[i - 1] ?? 10_000));

    const { data, retry } = await attempt<T>(endpoint, body, requiredFrom, timeoutMs);
    if (data) return data;
    if (!retry) return null;
  }

  return null;
}

export type ServerProposal = {
  proposal_id: string;
  creator: Address;
  start_date: number;
  end_date: number;
  /** Raw `metadata` bytes, hex-encoded — the IPFS URI before `fromHex`. */
  metadata: Hex;
  block: number;
  transaction_hash: string | null;
  /** Present only when asked for via `flags`; `undefined` means "not requested", which is not the
   *  same as `false`. */
  executed?: boolean;
  refund_claimed?: boolean;
};

/**
 * `ProposalCreated` for any Aragon-shaped plugin.
 *
 * CrispVoting, TokenVoting and both SPPs emit byte-identical events — same seven parameters, same
 * `0xa6c1f8f4…` topic — so one route serves all of them and only the address differs.
 */
export async function fetchProposals(options: {
  plugin: Address;
  fromBlock: number;
  proposalId?: bigint;
  /** `"executed"`, `"refund_claimed"`. Each is another topic for the server to scan, so ask only
   *  for what is rendered. */
  flags?: string[];
}): Promise<ServerProposal[] | null> {
  const data = await post<{ scanned_from: number; proposals: ServerProposal[] }>(
    "proposals",
    {
      plugin: options.plugin,
      from_block: options.fromBlock,
      ...(options.proposalId !== undefined ? { proposal_id: options.proposalId.toString() } : {}),
      ...(options.flags?.length ? { flags: options.flags } : {}),
    },
    options.fromBlock
  );

  return Array.isArray(data?.proposals) ? data.proposals : null;
}

export type ServerVote = {
  voter: Address;
  /** Aragon's `VoteOption`: 0 none, 1 abstain, 2 yes, 3 no. */
  vote_option: number;
  voting_power: string;
  block: number;
  transaction_hash: string | null;
};

/** Every ballot cast on one proposal, filtered server-side by the event's indexed `proposalId`. */
export async function fetchVotes(options: {
  plugin: Address;
  proposalId: bigint;
  fromBlock: number;
}): Promise<ServerVote[] | null> {
  const data = await post<{ scanned_from: number; votes: ServerVote[] }>(
    "proposals/votes",
    {
      plugin: options.plugin,
      proposal_id: options.proposalId.toString(),
      from_block: options.fromBlock,
    },
    options.fromBlock
  );

  return Array.isArray(data?.votes) ? data.votes : null;
}

export type ServerDelegates = {
  delegates: { address: Address; votingPower: bigint }[];
  totalSupply: bigint;
};

/**
 * The delegate directory: every address ever delegated to that still holds power, ranked.
 *
 * The one call here that waits and retries, because its fallback is not a real one. The route
 * builds the directory by scanning `DelegateChanged` from the token's deployment block, and the
 * FIRST caller after the server starts pays for that scan inside their request — tens of upstream
 * windows, long enough to time out in a browser. Every later caller gets it from the server's
 * cache in milliseconds. So a failure here is nearly always "come back in a moment", not "this
 * server cannot answer".
 *
 * Meanwhile the client-side fallback that failure drops us into scans the same range through the
 * indexer's own rate-limited RPC, ~40 sequential windowed `eth_getLogs` — slower than waiting,
 * and in practice it just fails differently. Retrying the route is strictly the better bet, and
 * a 4xx still returns immediately, so a server that genuinely does not serve this token costs
 * nothing.
 */
export async function fetchDelegates(options: {
  token: Address;
  fromBlock: number;
  /** Where voting power is read from, when that is not the token — here, the bonded-votes
   *  adapter. Named explicitly because a directory built entirely against the token would list
   *  the right delegates with the wrong numbers. */
  powerSource?: Address;
  /** Where `DelegateChanged` is emitted, when that is not the token. With the escrow enabled that
   *  is its IVotes adapter, and the token's own delegation feeds a read nobody consumes. */
  delegationSource?: Address;
}): Promise<ServerDelegates | null> {
  const data = await post<{
    scanned_from: number;
    total_supply: string;
    delegates: { address: Address; voting_power: string }[];
  }>(
    "members/delegates",
    {
      token: options.token,
      from_block: options.fromBlock,
      ...(options.powerSource && options.powerSource !== options.token ? { power_source: options.powerSource } : {}),
      ...(options.delegationSource && options.delegationSource !== options.token
        ? { delegation_source: options.delegationSource }
        : {}),
    },
    options.fromBlock,
    { attempts: 4, timeoutMs: 45_000 }
  );

  if (!Array.isArray(data?.delegates)) return null;

  return {
    // Already ranked and zero-filtered server-side; re-sorting here would only disagree.
    delegates: data.delegates.map((entry) => ({
      address: entry.address,
      votingPower: BigInt(entry.voting_power),
    })),
    totalSupply: BigInt(data.total_supply),
  };
}

export type ServerInput = {
  index: string;
  block: number;
  transaction_hash: string | null;
};

/**
 * When each encrypted ballot landed in a round.
 *
 * `/state/lite` reports how MANY inputs a round holds, but not when each arrived or in which
 * transaction — which is what the activity feed links to.
 */
export async function fetchRoundInputs(options: {
  roundId: bigint;
  fromBlock: number;
  program?: Address;
}): Promise<ServerInput[] | null> {
  const data = await post<{ scanned_from: number; inputs: ServerInput[] }>(
    "rounds/inputs",
    {
      round_id: options.roundId.toString(),
      from_block: options.fromBlock,
      ...(options.program ? { program: options.program } : {}),
    },
    options.fromBlock
  );

  return Array.isArray(data?.inputs) ? data.inputs : null;
}
