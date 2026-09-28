import { openDemoWalletPanel } from "./DemoWalletPanel";
import { useEffect, useRef } from "react";
import { useAccount, useConnect } from "wagmi";
import { formatHexString } from "@/utils/evm";
import { WalletButton } from "@/components/input/walletButton";
import { isDemoWalletDisconnected } from "./demoWalletSession";

export function DemoWallet() {
  const { address, isConnected, status } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const started = useRef(false);
  const connector = connectors.find((item) => item.id === "interfold-design-preview");

  useEffect(() => {
    if (started.current || status !== "disconnected" || !connector || isDemoWalletDisconnected()) return;
    started.current = true;
    connect({ connector });
  }, [connect, connector, status]);

  return (
    <WalletButton
      address={isConnected ? address : undefined}
      label={isPending ? "Connecting…" : isConnected && address ? formatHexString(address) : "Connect wallet"}
      disabled={isPending || !connector}
      title={error ? error.message : isConnected ? `Wallet controls · ${address}` : "Connect wallet"}
      onClick={() => (isConnected ? openDemoWalletPanel() : connector && connect({ connector }))}
    />
  );
}
