import { MemberAvatar } from "@aragon/ods";
import { createClient, http } from "viem";
import { createConfig, useEnsName, usePublicClient } from "wagmi";
import { mainnet } from "wagmi/chains";
import type { Address } from "viem";

import { AddressText } from "@/components/text/address";
import { blockieDataUrl } from "@/utils/blockies";

// ENS lives on Ethereum mainnet regardless of the app's chain, so lookups run against a
// dedicated mainnet config (same pattern as WalletContainer). Reads flow through the normal
// RPC endpoint/relay.
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

/** An address rendered as an ENS profile when one exists: blockie + name, address otherwise. */
export const EnsMember = ({ address }: { address: Address }) => {
  const client = usePublicClient();

  const { data: ensName } = useEnsName({
    config: ensConfig,
    chainId: mainnet.id,
    address,
  });

  // Always the blockie, matching how explorers render an address: Etherscan draws it
  // unconditionally and never substitutes an ENS avatar. Passing it as `src` also suppresses
  // MemberAvatar's own ENS lookup and its checksum-seeded fallback, both of which would disagree
  // with the explorer this row links to.
  const blockie = blockieDataUrl(address);

  const explorerUrl = client?.chain.blockExplorers?.default.url;

  return (
    <div className="flex min-w-0 items-center gap-x-3">
      <MemberAvatar src={blockie ?? ""} address={address} alt="Profile picture" size="sm" />
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
