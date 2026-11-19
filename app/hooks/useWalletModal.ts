import { useModal } from "connectkit";

export function useWalletModal() {
  const modal = useModal();
  return { open: () => modal.setOpen(true), isOpen: modal.open };
}
