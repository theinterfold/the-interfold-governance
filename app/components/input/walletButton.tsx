import type { ButtonHTMLAttributes } from "react";
import { MemberAvatar } from "@aragon/ods";
import { Wallet } from "@phosphor-icons/react";
import type { Address } from "viem";

/** The header and menu use the same wallet control in live and preview modes. */
export function WalletButton({
  address,
  avatar,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { address?: Address; avatar?: string; label: string }) {
  return (
    <button type="button" {...props} className="interfold-header-wallet">
      {address ? (
        <MemberAvatar address={address} src={avatar} alt="" size="sm" />
      ) : (
        <Wallet size={20} aria-hidden="true" />
      )}
      <span className={address ? "interfold-header-wallet-address" : undefined}>{label}</span>
    </button>
  );
}
