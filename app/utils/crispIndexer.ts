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

async function post<T extends Coverage>(endpoint: string, body: unknown, requiredFrom: number): Promise<T | null> {
  if (!PUB_CRISP_SERVER_URL || !requiredFrom) return null;

  try {
    const response = await fetch(`${PUB_CRISP_SERVER_URL.replace(/\/$/, "")}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as T;

    // Trust it only as far as it says it scanned. The server's own coverage starts wherever IT
    // began indexing, so an answer built from a shorter range is missing entries — and for a list,
    // missing entries are indistinguishable from there being none.
    if (!(data?.scanned_from <= requiredFrom)) return null;

    return data;
  } catch {
    return null;
  }
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

/** The delegate directory: every address ever delegated to that still holds power, ranked. */
export async function fetchDelegates(options: {
  token: Address;
  fromBlock: number;
  /** Where voting power is read from, when that is not the token — here, the bonded-votes
   *  adapter. Named explicitly because a directory built entirely against the token would list
   *  the right delegates with the wrong numbers. */
  powerSource?: Address;
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
    },
    options.fromBlock
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
