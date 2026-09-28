import { DEMO_WALLET, requireLocalPreview } from "./previewMode";

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

/** A second address-only account for reviewing sign-then-send. No private keys exist. */
export const DEMO_SENDING_WALLET = "0x000000000000000000000000000000000000deff" as const;
const accountKey = "interfold-demo-wallet-account";
export function getDemoAccount() {
  requireLocalPreview();
  try {
    if (typeof window !== "undefined" && window.sessionStorage.getItem(accountKey) === DEMO_SENDING_WALLET)
      return DEMO_SENDING_WALLET;
  } catch {
    /* Fall back to the voting wallet. */
  }
  return DEMO_WALLET;
}
export function selectDemoAccount(next: typeof DEMO_WALLET | typeof DEMO_SENDING_WALLET) {
  requireLocalPreview();
  if (next !== DEMO_WALLET && next !== DEMO_SENDING_WALLET) throw new Error("Unknown demo wallet.");
  if (next === getDemoAccount()) return;
  window.sessionStorage.setItem(accountKey, next);
  window.dispatchEvent(new CustomEvent("interfold-demo-account-changed", { detail: next }));
}
