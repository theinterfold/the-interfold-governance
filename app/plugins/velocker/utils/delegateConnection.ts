import type { Address } from "viem";

/** Resume a chosen delegate in review only, after the connection dialog has closed. */
export function createDelegateConnection(
  target: Address | undefined,
  onReview: (target?: Address) => void,
  onCancel: () => void
) {
  let active = true;
  let sawModal = false;
  const cancel = () => {
    if (!active) return;
    active = false;
    onCancel();
  };

  return {
    update({ connected, modalOpen }: { connected: boolean; modalOpen: boolean }) {
      if (!active) return;
      if (modalOpen) {
        sawModal = true;
        return;
      }
      if (connected) {
        active = false;
        onReview(target);
      } else if (sawModal) {
        cancel();
      }
    },
    cancel,
    dispose() {
      active = false;
    },
  };
}
