import { requireLocalPreview } from "./previewMode";

const storageKey = "interfold-demo-wallet-connection";
let disconnected: boolean | undefined;

/** An explicit disconnect survives navigation, menu remounts and a reload of this tab. */
export function isDemoWalletDisconnected() {
  requireLocalPreview();
  if (disconnected !== undefined) return disconnected;
  try {
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved !== null) return saved === "disconnected";
    }
  } catch {
    // Keep the in-memory choice when browser storage is unavailable.
  }
  return false;
}

export function setDemoWalletDisconnected(value: boolean) {
  requireLocalPreview();
  disconnected = value;
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey, value ? "disconnected" : "connected");
    }
  } catch {
    // Disconnecting must still work when browser storage is unavailable.
  }
}
