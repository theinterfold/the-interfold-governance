import { useWeb3Modal, useWeb3ModalState } from "@web3modal/wagmi/react";
import { useConnect } from "wagmi";
import { DESIGN_PREVIEW } from "@/dev/previewMode";

function useDemoModal() {
  const { connectAsync, connectors, isPending } = useConnect();
  return {
    isOpen: isPending,
    open: async () => {
      const connector = connectors.find((item) => item.id === "interfold-design-preview");
      if (!connector) throw new Error("Demo wallet is unavailable.");
      await connectAsync({ connector });
    },
  };
}

function useLiveModal() {
  const modal = useWeb3Modal();
  const { open: isOpen } = useWeb3ModalState();
  return { ...modal, isOpen };
}

export const useWalletModal = DESIGN_PREVIEW ? useDemoModal : useLiveModal;
