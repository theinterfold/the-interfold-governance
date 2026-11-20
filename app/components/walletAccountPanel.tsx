import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useAccount, useDisconnect } from "wagmi";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { ActionButton } from "@/components/input/actionButton";
import { WalletDetails } from "@/components/text/address";
import { formatHexString } from "@/utils/evm";

export function openWalletAccountPanel(trigger: HTMLElement) {
  window.dispatchEvent(new CustomEvent("interfold-wallet-account-open", { detail: trigger }));
}

/** Identical account actions in the mobile menu and the desktop account panel. */
export function WalletAccountContent({ address, pending, error, onDisconnect }: {
  address: Address;
  pending: boolean;
  error: unknown;
  onDisconnect: () => void;
}) {
  return <div className="wallet-account-content">
    <WalletDetails key={address} address={address} fallbackName={formatHexString(address)} />
    <ActionButton className="wallet-account-disconnect" disabled={pending} isLoading={pending} onClick={onDisconnect}>
      Disconnect
    </ActionButton>
    {!!error && <p role="alert" className="power-feedback">Could not disconnect. Please try again.</p>}
  </div>;
}

/** Kept outside the navbar so closing the mobile menu cannot unmount the panel. */
export function WalletAccountPanel() {
  const { address, isConnected } = useAccount();
  const { disconnect, isPending, error, reset } = useDisconnect();
  const [open, setOpen] = useState(false);
  // Retain the last identity while the dialog animates out after disconnecting.
  const [displayAddress, setDisplayAddress] = useState<Address>();
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = (event: Event) => {
      if (!isConnected || !address) return;
      trigger.current = event instanceof CustomEvent && event.detail instanceof HTMLElement
        ? event.detail : document.activeElement as HTMLElement | null;
      reset();
      setDisplayAddress(address);
      setOpen(true);
    };
    window.addEventListener("interfold-wallet-account-open", show);
    return () => window.removeEventListener("interfold-wallet-account-open", show);
  }, [address, isConnected, reset]);

  useEffect(() => {
    if (!isConnected) setOpen(false);
    else if (address) setDisplayAddress(address);
  }, [address, isConnected]);

  return (
    <ActionTray open={open} title="Your wallet" pending={isPending} triggerRef={trigger}
      onClose={() => setOpen(false)} className="wallet-account-panel">
      {displayAddress && <WalletAccountContent address={displayAddress} pending={isPending} error={error}
        onDisconnect={() => disconnect(undefined, { onSuccess: () => setOpen(false) })} />}
    </ActionTray>
  );
}
