import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";
import { PUB_TOKEN_ADDRESS } from "@/constants";

export function useToken() {
  const {
    data: tokenSupply,
    isError: isError1,
    isLoading: isLoading1,
  } = useReadContract({
    address: PUB_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "totalSupply",
  });

  const {
    data: tokenSymbol,
    isError: isError2,
    isLoading: isLoading2,
  } = useReadContract({
    address: PUB_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "symbol",
    // Immutable for the life of the token — unlike `totalSupply` above.
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: tokenDecimals } = useReadContract({
    address: PUB_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "decimals",
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  return {
    address: PUB_TOKEN_ADDRESS,
    tokenSupply,
    symbol: tokenSymbol,
    decimals: tokenDecimals,
    status: {
      isLoading: isLoading1 || isLoading2,
      isError: isError1 || isError2,
    },
  };
}
