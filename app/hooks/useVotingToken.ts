import { useReadContract } from "wagmi";
import { parseAbi, type Address } from "viem";
import { PUB_CHAIN, PUB_VOTING_POWER_SOURCE } from "@/constants";

// Both CrispVoting and TokenVoting expose this; declared minimally so neither plugin's full ABI
// has to be imported here.
const votingTokenAbi = parseAbi(["function getVotingToken() view returns (address)"]);

/**
 * The token that carries voting power for a governance plugin, read from the plugin itself.
 *
 * The plugin is the authority: it is what `createProposal` and the tally measure against, and
 * what the CRISP server builds its census from. `PUB_VOTING_POWER_SOURCE` only mirrors that in
 * env and can drift from the deployment, so it serves as a fallback while the read is in flight
 * or if the plugin is unreachable.
 *
 * On this deployment the voting token is BondedVotes rather than FOLD, and the two genuinely
 * disagree: a holder whose power comes from an escrow position has zero delegated FOLD, so
 * reading the raw governance token reports them as having no voting power at all.
 *
 * @param plugin The governance plugin to ask.
 * @returns The voting token address, falling back to the configured source.
 */
export function useVotingToken(plugin?: Address): Address {
  const { data } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: plugin,
    abi: votingTokenAbi,
    functionName: "getVotingToken",
    query: { enabled: Boolean(plugin) },
  });

  return (data as Address | undefined) ?? PUB_VOTING_POWER_SOURCE;
}
