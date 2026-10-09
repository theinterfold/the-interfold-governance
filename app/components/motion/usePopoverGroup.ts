import { useCallback, useEffect, useRef } from "react";

const eventName = "interfold:popover-open";

export function dismissOtherPopovers(owner: string) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: owner }));
}

/** Hover cards share one foreground slot instead of covering each other. */
export function usePopoverGroup(owner: string, onDismiss: () => void) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const onOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== owner) dismissRef.current();
    };
    window.addEventListener(eventName, onOpen);
    return () => window.removeEventListener(eventName, onOpen);
  }, [owner]);
  return useCallback(() => dismissOtherPopovers(owner), [owner]);
}
