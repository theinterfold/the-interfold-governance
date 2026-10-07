import { MemberAvatar } from "@aragon/ods";
import type { Address } from "viem";

import { AddressText } from "@/components/text/address";
import { useMemberName } from "@/hooks/useMemberName";
import { blockieDataUrl } from "@/utils/blockies";

/**
 * An address rendered as an ENS profile when one exists: blockie + name, address otherwise. The
 * name is an `AddressText` label, so its wallet card keeps the explorer link the raw address has.
 */
export const EnsMember = ({ address }: { address: Address }) => {
  const ensName = useMemberName(address);

  // Always the blockie, matching how explorers render an address: Etherscan draws it
  // unconditionally and never substitutes an ENS avatar. Passing it as `src` also suppresses
  // MemberAvatar's own ENS lookup and its checksum-seeded fallback, both of which would disagree
  // with the explorer this row links to.
  const blockie = blockieDataUrl(address);

  return (
    <div className="flex min-w-0 items-center gap-x-3">
      <MemberAvatar src={blockie ?? ""} address={address} alt="Profile picture" size="sm" />
      <AddressText bold={!!ensName} label={ensName ?? undefined}>
        {address}
      </AddressText>
    </div>
  );
};
