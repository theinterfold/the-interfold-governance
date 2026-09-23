import { useWeb3Modal } from "@web3modal/wagmi/react";
import { useConnect } from "wagmi";
import { DESIGN_PREVIEW } from "@/dev/previewMode";

function useDemoModal() {
  const { connectAsync, connectors } = useConnect();
  return {
    open: async () => {
      const connector = connectors.find((item) => item.id === "interfold-design-preview");
      if (connector) await connectAsync({ connector });
    },
  };
}

export const useWalletModal = DESIGN_PREVIEW ? useDemoModal : useWeb3Modal;
