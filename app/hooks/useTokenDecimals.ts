import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS } from "@/constants";

/**
 * Decimals of the DAO voting token (FOLD), read on-chain.
 *
 * Returns `undefined` until the read resolves — do NOT substitute a default.
 * The token's decimals feed quorum math and the CRISP vote scaling
 * (`10^(decimals-1)`, which must match the CRISP server's merkle leaves), so a
 * guessed 18 would silently produce wrong turnout figures against a token that
 * isn't 18. Gate rendering on `undefined` instead.
 */
export function useTokenDecimals(): number | undefined {
  const { data } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "decimals",
  });

  return data === undefined ? undefined : Number(data);
}
