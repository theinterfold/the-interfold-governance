import { createContext, useContext } from "react";
import { isAddress } from "viem";
import {
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_RETIRED_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_RETIRED_SPP_PRIVATE_ADDRESS,
  PUB_SPP_PRIVATE_ADDRESS,
} from "@/constants";

import type { Address } from "viem";

/** One private process: the SPP that holds its proposals and the CRISP body that runs their vote. */
export interface PrivatePair {
  spp: Address;
  body: Address;
}

/** The installed pair. Every new private proposal is created on it. */
export const INSTALLED_PRIVATE_PAIR: PrivatePair = {
  spp: PUB_SPP_PRIVATE_ADDRESS,
  body: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
};

/**
 * The pair that a replacement install retired, if any. It lost every permission that leads to a DAO
 * action, but its proposals, tallies, fee credit and refunds stay on chain.
 */
export const RETIRED_PRIVATE_PAIR: PrivatePair | undefined =
  isAddress(PUB_RETIRED_SPP_PRIVATE_ADDRESS) && isAddress(PUB_RETIRED_CRISP_VOTING_PLUGIN_ADDRESS)
    ? { spp: PUB_RETIRED_SPP_PRIVATE_ADDRESS, body: PUB_RETIRED_CRISP_VOTING_PLUGIN_ADDRESS }
    : undefined;

const PrivatePairContext = createContext<PrivatePair>(INSTALLED_PRIVATE_PAIR);

/** Scopes a subtree to one pair. Outside a provider, every read goes to the installed pair. */
export const PrivatePairProvider = PrivatePairContext.Provider;

/**
 * The pair whose proposals this subtree shows. Every private-process read and write takes its
 * addresses from here, so the same list row and detail page serve a retired pair unchanged.
 */
export function usePrivatePair(): PrivatePair {
  return useContext(PrivatePairContext);
}
