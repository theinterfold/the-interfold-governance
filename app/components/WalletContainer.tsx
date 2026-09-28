import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { DemoWallet } from "@/dev/DemoWallet";
import { PUB_CHAIN } from "@/constants";
import { formatHexString } from "@/utils/evm";
import { WalletButton } from "@/components/input/walletButton";
import { useWalletModal } from "@/hooks/useWalletModal";
import { useEffect } from "react";
import { createClient, http } from "viem";
import { normalize } from "viem/ens";
import { createConfig, useAccount, useEnsAvatar, useEnsName, useSwitchChain } from "wagmi";
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

// TODO: update with ODS wallet module - [https://linear.app/aragon/issue/RD-198/create-ods-walletmodule]
const WalletContainer = () => {
  const { open } = useWalletModal();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const { data: ensName } = useEnsName({
    config,
    chainId: mainnet.id,
    address: address,
  });

  const { data: ensAvatar } = useEnsAvatar({
    config,
    name: normalize(ensName!),
    chainId: mainnet.id,
    gatewayUrls: ["https://cloudflare-ipfs.com"],
    query: { enabled: !!ensName },
  });

  useEffect(() => {
    if (!chainId) return;
    else if (chainId === PUB_CHAIN.id) return;

    switchChain({ chainId: PUB_CHAIN.id });
  }, [chainId, switchChain]);

  return (
    <WalletButton
      address={isConnected ? address : undefined}
      avatar={ensAvatar ?? undefined}
      label={isConnected && address ? (ensName ?? formatHexString(address)) : "Connect wallet"}
      onClick={() => open()}
    />
  );
};

export default DESIGN_PREVIEW ? DemoWallet : WalletContainer;
