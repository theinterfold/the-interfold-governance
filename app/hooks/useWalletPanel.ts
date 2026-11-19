import { useModal } from "connectkit";
import { useEffect, useRef } from "react";

export function useWalletPanel() {
  const modal = useModal();
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (modal.open || !trigger.current) return;
    const target = trigger.current;
    trigger.current = null;
    if (target.isConnected) target.focus({ preventScroll: true });
  }, [modal.open]);

  return (target: HTMLElement) => {
    trigger.current = target;
    modal.setOpen(true);
  };
}
