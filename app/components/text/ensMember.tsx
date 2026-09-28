import { MemberAvatar } from "@aragon/ods";
import { normalize } from "viem/ens";
import { useEnsAvatar } from "wagmi";
import { mainnet } from "wagmi/chains";
import type { Address } from "viem";

import { AddressText } from "@/components/text/address";
import { ensConfig, useMemberName } from "@/hooks/useMemberName";

/** An address rendered as an ENS profile when one exists: avatar + name, address otherwise. */
export const EnsMember = ({ address }: { address: Address }) => {
  const ensName = useMemberName(address);

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
      <AddressText bold={!!ensName} label={ensName ?? undefined}>
        {address}
      </AddressText>
    </div>
  );
};
