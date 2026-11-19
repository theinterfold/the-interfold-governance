import { useModal } from "connectkit";
import { useEffect, useRef } from "react";

const walletControls = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)';

export function useWalletModal() {
  const modal = useModal();
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = trigger.current;
    if (!target) return;
    if (!modal.open) {
      trigger.current = null;
      if (target.isConnected) target.focus({ preventScroll: true });
      return;
    }

    // ConnectKit initially focuses its wrapper, outside its own dialog's tab loop.
    const enterDialog = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const dialog = document.querySelector('#__CONNECTKIT__ [role="dialog"]');
      if (!dialog || dialog.contains(document.activeElement)) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(walletControls))
        .filter((item) => item.getClientRects().length > 0);
      const next = event.shiftKey ? controls[controls.length - 1] : controls[0];
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      next.focus();
    };
    document.addEventListener("keydown", enterDialog, true);
    return () => document.removeEventListener("keydown", enterDialog, true);
  }, [modal.open]);

  return {
    open: () => {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modal.setOpen(true);
    },
    isOpen: modal.open,
  };
}
