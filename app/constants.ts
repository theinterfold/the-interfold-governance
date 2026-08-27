import { getChain } from "./utils/chains";

import type { Address } from "viem";
import type { ChainName } from "./utils/chains";

// Contract Addresses
export const PUB_DAO_ADDRESS = (process.env.NEXT_PUBLIC_DAO_ADDRESS ?? "") as Address;
export const PUB_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "") as Address;
export const PUB_INTERFOLD_FEE_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_INTERFOLD_FEE_TOKEN_ADDRESS ?? "") as Address;
// `BondedVotes`: the IVotes adapter that reports wallet FOLD *plus* FOLD bonded as ciphernode
// collateral. Bonded FOLD sits in the BondingRegistry, which never delegates it, so reading the
// token directly reports zero weight for an operator who has bonded everything — while that same
// FOLD still counts in the quorum denominator.
//
// Reads only. It holds no delegation state: `delegate()` reverts `DelegationNotSupported`, and it
// emits no `DelegateChanged`, so delegation and the delegate list must stay on the token itself.
//
// Falls back to the token when unset, which keeps the app working against a deployment that has
// no adapter — it just cannot see bonded weight.
export const PUB_BONDED_VOTES_ADDRESS = (process.env.NEXT_PUBLIC_BONDED_VOTES_ADDRESS ?? "") as Address;
/// The address to read balances and voting power from.
export const PUB_VOTING_POWER_SOURCE = (PUB_BONDED_VOTES_ADDRESS || PUB_TOKEN_ADDRESS) as Address;
// VotingEscrow ("velocker"): lock FOLD to gain voting power. Only the escrow address is
// configured — its lock NFT, exit queue and IVotes adapter are read off it on-chain, so the
// app can never pair a locker with the wrong satellites. Locked votes are delegated on the
// ADAPTER, not the token; a lock with no adapter delegation carries no voting power.
// Unset => the whole locking section is hidden (deployments where only wallet FOLD votes).
export const PUB_VE_LOCKER_ADDRESS = (process.env.NEXT_PUBLIC_VE_LOCKER_ADDRESS ?? "") as Address;
export const PUB_ENABLE_LOCKING = !!PUB_VE_LOCKER_ADDRESS;
// Testnet faucet: one `faucet()` call drips both FOLD and the fee token to the caller.
export const PUB_FAUCET_ADDRESS = (process.env.NEXT_PUBLIC_FAUCET_ADDRESS ?? "") as Address;
// Testnet-only UI. Must be false/unset in production — there is no faucet on mainnet
// and the button would point at a non-existent contract.
export const PUB_ENABLE_FAUCET =
  (process.env.NEXT_PUBLIC_ENABLE_FAUCET ?? "").toLowerCase() === "true" && !!PUB_FAUCET_ADDRESS;
export const PUB_CRISP_VOTING_PLUGIN_ADDRESS = (process.env.NEXT_PUBLIC_CRISP_VOTING_PLUGIN_ADDRESS ?? "") as Address;
export const PUB_TOKEN_VOTING_PLUGIN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_VOTING_PLUGIN_ADDRESS ?? "") as Address;
// Staged Proposal Processor (SPP) instances — proposals are created here; the bodies above are stage-0 sub-bodies.
export const PUB_SPP_PRIVATE_ADDRESS = (process.env.NEXT_PUBLIC_SPP_PRIVATE_ADDRESS ?? "") as Address;
export const PUB_SPP_PUBLIC_ADDRESS = (process.env.NEXT_PUBLIC_SPP_PUBLIC_ADDRESS ?? "") as Address;
export const PUB_CRISP_SERVER_URL = (process.env.NEXT_PUBLIC_CRISP_SERVER_URL ?? "") as string;
// The CRISP program (Crisp.sol). `CrispVoting` stores it privately with no getter, so the
// app needs it from env to read a round's on-chain data (merkle root, numOptions, ...).
export const PUB_CRISP_PROGRAM_ADDRESS = (process.env.NEXT_PUBLIC_CRISP_PROGRAM_ADDRESS ?? "") as Address;

export const PUB_BRIDGE_ADDRESS = (process.env.NEXT_PUBLIC_BRIDGE_ADDRESS ?? "") as Address;

export const PUBLIC_SECONDS_PER_BLOCK = Number(process.env.NEXT_PUBLIC_SECONDS_PER_BLOCK ?? 1); // ETH Mainnet block takes ~12s
export const MINIMUM_START_DELAY_IN_SECONDS = Number(process.env.NEXT_PUBLIC_MINIMUM_START_DELAY_IN_SECONDS ?? 30);

// Target chain
export const PUB_CHAIN_NAME = (process.env.NEXT_PUBLIC_CHAIN_NAME ?? "holesky") as ChainName;
export const PUB_CHAIN = getChain(PUB_CHAIN_NAME);
export const PUB_CHAIN_ID = PUB_CHAIN.id;

// Network and services
// Empty/unset => the app talks to its own server-side relay (/api/rpc), which forwards to the
// server-only WEB3_RPC_URL — so a keyed endpoint never ships in the client bundle (INV-27).
// Set NEXT_PUBLIC_WEB3_ENDPOINT only for a keyless public endpoint (or local dev shortcuts).
// (Trailing slash on purpose: next.config sets trailingSlash, and the bare path would cost a
// 308 redirect on every single RPC request.)
// Preference order: an explicit endpoint, then the CRISP server's read-only JSON-RPC route, then
// the local proxy. The middle one is the point — the CRISP server already watches these contracts
// to index rounds, so it can serve their reads too and this app needs no provider account of its
// own. Writes are unaffected: the user's wallet supplies its own transport.
export const PUB_WEB3_ENDPOINT =
  process.env.NEXT_PUBLIC_WEB3_ENDPOINT ||
  (PUB_CRISP_SERVER_URL ? `${PUB_CRISP_SERVER_URL.replace(/\/$/, "")}/chain/rpc` : "/api/rpc/");

/**
 * Where a read goes when the primary endpoint refuses it.
 *
 * The CRISP server's `/chain/rpc` only answers for the contracts it indexes; anything else comes
 * back as `Address not served by this indexer: 0x…`. That is fine for the contracts named in this
 * file, but the app also reaches addresses it discovers ON CHAIN — the escrow's exit queue, lock
 * NFT and IVotes adapter are read off the escrow (useVeEscrow), and they are not in any allowlist
 * the server could have been configured with. Those reads failed silently: the lock copy printed
 * "a —-day cooldown" and the delegate list gave up with "Could not load delegates".
 *
 * So keep the indexer first (it is the whole point — no provider account needed) and let the
 * generic relay pick up whatever it will not serve. Unset when the indexer IS the relay, or when
 * an explicit endpoint was configured — in both cases there is nothing to fall back to.
 */
export const PUB_WEB3_FALLBACK_ENDPOINT =
  !process.env.NEXT_PUBLIC_WEB3_ENDPOINT && PUB_CRISP_SERVER_URL ? "/api/rpc/" : "";

/**
 * Requests per JSON-RPC batch.
 *
 * Must not exceed the CRISP server's `MAX_RPC_BATCH`, which is 64: the server executes a batch
 * sequentially, so it bounds the fan-out one request can cause, and it rejects an oversized batch
 * WHOLESALE — every call in it fails, not just the surplus. viem's `batch: true` default is 1000,
 * and a proposal list resolving a dozen reads per row clears 64 in a single tick, so the default
 * would turn a busy screen into a page of errors.
 *
 * A plain hosted provider has no such limit, so this only ever costs an extra round trip there.
 */
export const PUB_RPC_BATCH_SIZE = 64;

export const PUB_WALLET_CONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

export const PUB_IPFS_ENDPOINTS = process.env.NEXT_PUBLIC_IPFS_ENDPOINTS ?? "";

// General
export const PUB_DEPLOYMENT_BLOCK = Number(process.env.NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK ?? 0);
// Block the FOLD token was deployed at — start of the delegate-event scan.
export const PUB_TOKEN_DEPLOYMENT_BLOCK = Number(process.env.NEXT_PUBLIC_TOKEN_DEPLOYMENT_BLOCK ?? 0);
// Block the VotingEscrow was deployed at, which is also its satellites' — the lock NFT, exit
// queue and IVotes adapter ship in the same transaction.
//
// A delegate scan has to start where the contract it scans began, not where the TOKEN began. With
// locking on, `DelegateChanged` comes from the adapter, which on mainnet is ~306k blocks younger
// than FOLD: scanning from the token's block asks the indexer (or the browser) to walk a third of
// a million blocks that cannot contain a single matching event, and that walk is what the first
// caller after a server restart waits for.
//
// Falls back to the token's block when unset, which is correct but slow — never wrong, so a
// deployment that has not filled this in still works.
export const PUB_VE_LOCKER_DEPLOYMENT_BLOCK = Number(process.env.NEXT_PUBLIC_VE_LOCKER_DEPLOYMENT_BLOCK ?? 0);
/** Where `DelegateChanged` history starts, for whichever contract actually emits it. */
export const PUB_DELEGATION_DEPLOYMENT_BLOCK =
  (PUB_ENABLE_LOCKING && PUB_VE_LOCKER_DEPLOYMENT_BLOCK) || PUB_TOKEN_DEPLOYMENT_BLOCK;
export const PUB_APP_NAME = "Interfold Governance";
export const PUB_APP_DESCRIPTION =
  "Governance for the Interfold — public on-chain proposals and private, encrypted (CRISP) proposals, powered by Aragon OSx and FOLD.";
export const PUB_TOKEN_SYMBOL = "FOLD";

export const PUB_PROJECT_LOGO = "/theinterfold-logo.png";
export const PUB_PROJECT_URL = process.env.NEXT_PUBLIC_PROJECT_URL ?? "https://theinterfold.com/";
export const PUB_WALLET_ICON = "https://avatars.githubusercontent.com/u/37784886";
export const PUB_BLOG_URL = "https://blog.theinterfold.com/";
export const PUB_SOCIALS_URL = "https://x.com/theinterfold";
export const PUB_GET_FOLD_URL =
  process.env.NEXT_PUBLIC_GET_FOLD_URL ??
  "https://app.uniswap.org/swap?outputCurrency=0xE172e9B6cfBeeB5593bDcE3f077356FDb33af904&chain=mainnet";
export const PUB_CRISP_INFO_URL =
  process.env.NEXT_PUBLIC_CRISP_INFO_URL ?? "https://docs.theinterfold.com/CRISP/introduction";
