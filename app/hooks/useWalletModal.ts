import { useWeb3Modal, useWeb3ModalState } from "@web3modal/wagmi/react";

export function useWalletModal() {
  const modal = useWeb3Modal();
  const { open: isOpen } = useWeb3ModalState();
  return { ...modal, isOpen };
}
