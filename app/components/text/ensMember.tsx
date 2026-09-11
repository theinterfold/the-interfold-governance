import { MemberAvatar } from "@aragon/ods";
import { createClient, http } from "viem";
import { normalize } from "viem/ens";
import { createConfig, useEnsAvatar, useEnsName, usePublicClient } from "wagmi";
import { mainnet } from "wagmi/chains";
import type { Address } from "viem";

import { AddressText } from "@/components/text/address";
import { useBlockieDataUrl } from "@/utils/blockies";

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
  const client = usePublicClient();

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

  // `MemberAvatar`'s own fallback seeds blockies with the CHECKSUMMED address, which produces a
  // different icon from the one explorers draw for the same account. Passing an explorer-seeded
  // data URL as `src` overrides it. A real ENS avatar still wins when the account has one.
  const blockie = useBlockieDataUrl(address);

  const explorerUrl = client?.chain.blockExplorers?.default.url;

  return (
    <div className="flex min-w-0 items-center gap-x-3">
      <MemberAvatar src={ensAvatar ?? blockie ?? ""} address={address} alt="Profile picture" size="sm" />
      {ensName ? (
        // Resolving to ENS must not cost the explorer link: the name replaces the address as the
        // label, so it has to carry the same href the raw address would have had.
        explorerUrl ? (
          <a
            href={`${explorerUrl}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            title={address}
            className="truncate font-semibold text-neutral-800 underline"
          >
            {ensName}
          </a>
        ) : (
          <span className="truncate font-semibold text-neutral-800" title={address}>
            {ensName}
          </span>
        )
      ) : (
        <AddressText bold={false}>{address}</AddressText>
      )}
    </div>
  );
};
