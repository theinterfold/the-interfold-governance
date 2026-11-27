import { createContext, useContext } from "react";
import {
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_RETIRED_CRISP_VOTING_PLUGIN_ADDRESSES,
  PUB_RETIRED_SPP_PRIVATE_ADDRESSES,
  PUB_SPP_PRIVATE_ADDRESS,
} from "@/constants";
import { parseRetiredPairs, type PrivatePair } from "@/utils/retiredPairs";

export type { PrivatePair };

/** The installed pair. Every new private proposal is created on it. */
export const INSTALLED_PRIVATE_PAIR: PrivatePair = {
  spp: PUB_SPP_PRIVATE_ADDRESS,
  body: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
};

/**
 * The pairs that replacement installs retired, in the order of the env lists. Each lost every
 * permission that leads to a DAO action, but its proposals, tallies, fee credit and refunds stay on
 * chain. Parsed when this module loads, so a misconfigured list fails the build and the first page
 * load instead of hiding a pair.
 *
 * Each body is read through the one `CrispVotingAbi`, with the CRISP program that its own round was
 * requested against (`resolveCrispProgram` reads it from the E3). The builds that these bodies run
 * (2 and 3) have the same read surface as the installed one.
 */
export const RETIRED_PRIVATE_PAIRS: readonly PrivatePair[] = parseRetiredPairs(
  PUB_RETIRED_SPP_PRIVATE_ADDRESSES,
  PUB_RETIRED_CRISP_VOTING_PLUGIN_ADDRESSES
);

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
