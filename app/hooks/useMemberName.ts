import { createClient, http, zeroAddress, type Address } from "viem";
import { createConfig } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getEnsNameQueryOptions } from "wagmi/query";
import { mainnet } from "wagmi/chains";

// Keep every address name on the same read-only ENS cache.
// ENS lives on mainnet, independently of the governance deployment.
export const ensConfig = createConfig({
  chains: [mainnet],
  ssr: true,
  client({ chain }) {
    return createClient({ chain, transport: http(undefined, { batch: true }) });
  },
});

export function memberNameQueryOptions(address?: Address) {
  return {
    ...getEnsNameQueryOptions(ensConfig, {
      chainId: mainnet.id,
      address: address?.toLowerCase() as Address | undefined,
    }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  };
}

export function useMemberName(address?: Address) {
  const { data } = useQuery({
    ...memberNameQueryOptions(address),
    enabled: !!address && address !== zeroAddress,
  });
  return data;
}
