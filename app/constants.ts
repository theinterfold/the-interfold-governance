import { getChain } from "./utils/chains";

import type { Address } from "viem";
import type { ChainName } from "./utils/chains";

// Contract Addresses
export const PUB_DAO_ADDRESS = (process.env.NEXT_PUBLIC_DAO_ADDRESS ?? "") as Address;
export const PUB_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "") as Address;
export const PUB_INTERFOLD_FEE_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_INTERFOLD_FEE_TOKEN_ADDRESS ?? "") as Address;
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
export const PUB_WEB3_ENDPOINT = process.env.NEXT_PUBLIC_WEB3_ENDPOINT ?? "";

export const PUB_WALLET_CONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

export const PUB_IPFS_ENDPOINTS = process.env.NEXT_PUBLIC_IPFS_ENDPOINTS ?? "";

// General
export const PUB_DEPLOYMENT_BLOCK = Number(process.env.NEXT_PUBLIC_PLUGIN_DEPLOYMENT_BLOCK ?? 0);
// Block the FOLD token was deployed at — start of the delegate-event scan.
export const PUB_TOKEN_DEPLOYMENT_BLOCK = Number(process.env.NEXT_PUBLIC_TOKEN_DEPLOYMENT_BLOCK ?? 0);
export const PUB_APP_NAME = "The Interfold";
export const PUB_APP_DESCRIPTION =
  "Governance for the Interfold — public on-chain proposals and private, encrypted (CRISP) proposals, powered by Aragon OSx and FOLD.";
export const PUB_TOKEN_SYMBOL = "FOLD";

export const PUB_PROJECT_LOGO = "/theinterfold-logo.png";
export const PUB_PROJECT_URL = process.env.NEXT_PUBLIC_PROJECT_URL ?? "https://theinterfold.com/";
export const PUB_WALLET_ICON = "https://avatars.githubusercontent.com/u/37784886";
export const PUB_BLOG_URL = "https://blog.theinterfold.com/";
export const PUB_SOCIALS_URL = "https://x.com/theinterfold";
export const PUB_CRISP_INFO_URL = process.env.NEXT_PUBLIC_CRISP_INFO_URL ?? "https://docs.theinterfold.com/";
