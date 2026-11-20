import type { ButtonHTMLAttributes } from "react";
import { blockieDataUrl } from "@/utils/blockies";
import { MemberAvatar } from "@aragon/ods";
import { CaretRight, Wallet } from "@phosphor-icons/react";
import type { Address } from "viem";

/** The header and the mobile menu share this wallet control. */
export function WalletButton({
  address,
  avatar,
  label,
  placement = "header",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { address?: Address; avatar?: string; label: string; placement?: "header" | "menu" | "mobile" }) {
  let visibleLabel = label;
  if (placement === "mobile") {
    if (address && label.startsWith("0x")) visibleLabel = `${address.slice(0, 4)}…${address.slice(-4)}`;
    else if (label === "Connect wallet") visibleLabel = "Connect";
  }
  return (
    <button type="button" aria-haspopup="dialog"
      aria-label={address ? `Wallet controls · ${label}` : label}
      {...props} className={`interfold-header-wallet ${className}`} data-placement={placement}>
      <span className="interfold-header-wallet-icon" aria-hidden="true">
      {address ? (
        <MemberAvatar address={address} src={avatar ?? blockieDataUrl(address)} alt="" size="sm" />
      ) : (
        <Wallet size={20} aria-hidden="true" />
      )}
      </span>
      <span className={`interfold-header-wallet-label${address ? " interfold-header-wallet-address" : ""}`}>{visibleLabel}</span>
      {placement === "menu" && <CaretRight className="interfold-header-wallet-arrow" size={20} aria-hidden="true" />}
    </button>
  );
}
