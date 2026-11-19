import { PUB_CHAIN } from "@/constants";
import { formatHexString } from "@/utils/evm";
import { WalletButton } from "@/components/input/walletButton";
import { openWalletAccountPanel } from "@/components/walletAccountPanel";
import { useWalletPanel } from "@/hooks/useWalletPanel";
import { useEffect } from "react";
import { createClient, http } from "viem";
import { createConfig, useAccount, useEnsName, useSwitchChain } from "wagmi";
import { mainnet } from "wagmi/chains";

const config = createConfig({
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

export type WalletContainerProps = { placement?: "header" | "mobile" };
const WalletContainer = ({ placement }: WalletContainerProps) => {
  const openPanel = useWalletPanel();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const { data: ensName } = useEnsName({
    config,
    chainId: mainnet.id,
    address: address,
  });

  useEffect(() => {
    if (!chainId) return;
    else if (chainId === PUB_CHAIN.id) return;

    switchChain({ chainId: PUB_CHAIN.id });
  }, [chainId, switchChain]);

  return (
    <WalletButton
      placement={placement}
      address={isConnected ? address : undefined}
      label={isConnected && address ? (ensName ?? formatHexString(address)) : "Connect wallet"}
      onClick={(event) => {
        const trigger = event.currentTarget;
        trigger.focus({ preventScroll: true });
        if (isConnected && placement !== "mobile") openWalletAccountPanel(trigger);
        else openPanel(trigger);
      }}
    />
  );
};

export default WalletContainer;
