import type { Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { iVotesAbi } from "@/plugins/crispVoting/artifacts/iVotes";
import { PUB_CHAIN, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";

/**
 * Mirrors the on-chain gate in TokenVoting.createProposal, which checks
 * `getVotes(sender)` — i.e. *delegated* voting power, NOT raw token balance.
 * A holder who never delegated has `getVotes == 0` and is rejected.
 */
export function useCanCreateProposal(): boolean {
  const { address } = useAccount();

  const { data: pluginReads } = useReadContracts({
    contracts: [
      {
        chainId: PUB_CHAIN.id,
        address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
        abi: TokenVotingAbi,
        functionName: "minProposerVotingPower",
      },
      {
        chainId: PUB_CHAIN.id,
        address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
        abi: TokenVotingAbi,
        functionName: "getVotingToken",
      },
    ],
  });

  const minProposerVotingPower = pluginReads?.[0]?.result as bigint | undefined;
  const votingToken = pluginReads?.[1]?.result as Address | undefined;

  const { data: votesRead } = useReadContracts({
    query: { enabled: Boolean(address && votingToken) },
    contracts: [
      {
        chainId: PUB_CHAIN.id,
        address: votingToken,
        abi: iVotesAbi,
        functionName: "getVotes",
        args: [address as Address],
      },
    ],
  });

  const votes = votesRead?.[0]?.result as bigint | undefined;

  if (!address) return false;
  else if (minProposerVotingPower === 0n) return true;
  else if (votes === undefined || minProposerVotingPower === undefined) return false;
  else return votes >= minProposerVotingPower;
}
