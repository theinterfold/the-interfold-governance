import { MemberAvatar } from "@aragon/ods";
import { createClient, http } from "viem";
import { normalize } from "viem/ens";
import { createConfig, useEnsAvatar, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import type { Address } from "viem";

import { AddressText } from "@/components/text/address";

// ENS lives on Ethereum mainnet regardless of the app's chain, so lookups run against a
// dedicated mainnet config (same pattern as WalletContainer). Reads flow through the normal
// RPC endpoint/relay; avatar images load client-side from wherever the ENS record points.
const ensConfig = createConfig({
  chains: [mainnet],
  ssr: true,
  client({ chain }) {
    return createClient({
      chain,
      // ENS lives on mainnet, so it cannot come from the chain endpoint above (which points at
      // this deployment's chain). viem's default mainnet transport needs no key, and a failed
      // lookup only costs us a raw address in the UI.
      transport: http(undefined, { batch: true }),
    });
  },
});

/** An address rendered as an ENS profile when one exists: avatar + name, address otherwise. */
export const EnsMember = ({ address }: { address: Address }) => {
  const { data: ensName } = useEnsName({
    config: ensConfig,
    chainId: mainnet.id,
    address,
  });

  const { data: ensAvatar } = useEnsAvatar({
    config: ensConfig,
    chainId: mainnet.id,
    name: normalize(ensName ?? ""),
    gatewayUrls: ["https://cloudflare-ipfs.com"],
    query: { enabled: !!ensName },
  });

  return (
    <div className="flex min-w-0 items-center gap-x-3">
      <MemberAvatar src={ensAvatar ?? ""} address={address} alt="Profile picture" size="sm" />
      {ensName ? (
        <span className="truncate font-semibold text-neutral-800">{ensName}</span>
      ) : (
        <AddressText bold={false}>{address}</AddressText>
      )}
    </div>
  );
};
