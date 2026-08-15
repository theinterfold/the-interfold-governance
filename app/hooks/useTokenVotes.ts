import { iVotesAbi } from "../plugins/crispVoting/artifacts/iVotes";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS, PUB_VOTING_POWER_SOURCE } from "@/constants";
import { type Address } from "viem";
import { useReadContracts } from "wagmi";

/** Returns the delegate (if any) for the given address */
export const useTokenVotes = (address?: Address) => {
  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      {
        chainId: PUB_CHAIN.id,
        abi: iVotesAbi,
        functionName: "delegates",
        args: [address!],
        address: PUB_TOKEN_ADDRESS,
      },
      // Votes and balance come from the adapter: both include FOLD bonded as ciphernode
      // collateral, which the token alone reports as zero because the registry never delegates
      // it. `delegates` above stays on the token — the adapter has no delegation state.
      {
        chainId: PUB_CHAIN.id,
        abi: iVotesAbi,
        functionName: "getVotes",
        args: [address!],
        address: PUB_VOTING_POWER_SOURCE,
      },
      {
        chainId: PUB_CHAIN.id,
        abi: iVotesAbi,
        functionName: "balanceOf",
        args: [address!],
        address: PUB_VOTING_POWER_SOURCE,
      },
    ],
    query: { enabled: !!address },
  });

  return {
    delegatesTo: data?.[0].result,
    votingPower: data?.[1].result,
    balance: data?.[2].result,
    isLoading,
    isError,
    refetch,
  };
};
