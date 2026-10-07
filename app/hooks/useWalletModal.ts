import { useWeb3Modal, useWeb3ModalState } from "@web3modal/wagmi/react";
import { useSyncExternalStore } from "react";
import { DESIGN_PREVIEW } from "@/dev/previewMode";
import {
  subscribeDemoWalletConnection,
  getDemoWalletConnectionOpen,
  getServerDemoWalletConnectionOpen,
  requestDemoWalletConnection,
} from "@/dev/demoWalletConnection";

function useDemoModal() {
  const isOpen = useSyncExternalStore(
    subscribeDemoWalletConnection,
    getDemoWalletConnectionOpen,
    getServerDemoWalletConnectionOpen
  );
  return {
    isOpen,
    // Dismissing the connector is an ordinary UI outcome for generic connect buttons.
    open: () => requestDemoWalletConnection().catch(() => {}),
  };
}

function useLiveModal() {
  const modal = useWeb3Modal();
  const { open: isOpen } = useWeb3ModalState();
  return { ...modal, isOpen };
}

export const useWalletModal = DESIGN_PREVIEW ? useDemoModal : useLiveModal;
