import { iVotesAbi } from "../plugins/crispVoting/artifacts/iVotes";
import { PUB_CHAIN, PUB_ENABLE_LOCKING, PUB_TOKEN_ADDRESS, PUB_VOTING_POWER_SOURCE } from "@/constants";
import { useVeEscrow } from "@/plugins/velocker/hooks/useVeEscrow";
import { type Address } from "viem";
import { useReadContracts } from "wagmi";

/** Returns the delegate (if any) for the given address */
export const useTokenVotes = (address?: Address) => {
  // With the velocker enabled, delegation state lives on the escrow's IVotes adapter — the
  // token's own delegation feeds a read nothing consumes. The adapter address is resolved
  // off the escrow on-chain.
  const { adapter } = useVeEscrow();
  const delegationSource = PUB_ENABLE_LOCKING ? adapter : PUB_TOKEN_ADDRESS;

  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      {
        chainId: PUB_CHAIN.id,
        abi: iVotesAbi,
        functionName: "delegates",
        args: [address!],
        address: delegationSource!,
      },
      // Votes and balance come from the BondedVotes adapter: both include FOLD bonded as
      // ciphernode collateral and escrow-locked FOLD, which the token alone reports as zero.
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
    query: { enabled: !!address && !!delegationSource },
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
