import { createClient, http, zeroAddress, type Address } from "viem";
import { createConfig, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";

// Keep directory entries and selected delegates on the same read-only ENS cache.
// ENS lives on mainnet, independently of the governance deployment or demo wallet.
export const ensConfig = createConfig({
  chains: [mainnet],
  ssr: true,
  client({ chain }) {
    return createClient({ chain, transport: http(undefined, { batch: true }) });
  },
});

export function useMemberName(address?: Address) {
  const { data } = useEnsName({
    config: ensConfig,
    chainId: mainnet.id,
    address,
    query: { enabled: !!address && address !== zeroAddress, staleTime: 5 * 60 * 1000 },
  });
  return data;
}
