import { requireLocalPreview } from "./previewMode";

type ConnectionRequest = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};

let request: ConnectionRequest | undefined;
const listeners = new Set<() => void>();
export const subscribeDemoWalletConnection = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getDemoWalletConnectionOpen = () => !!request;
export const getServerDemoWalletConnectionOpen = () => false;

/** A connect action opens a choice; it never connects an account by itself. */
export function requestDemoWalletConnection() {
  requireLocalPreview();
  if (request) return request.promise;
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, cancel) => {
    resolve = accept;
    reject = cancel;
  });
  request = { promise, resolve, reject };
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new Event("interfold-demo-wallet-connect"));
  return promise;
}

/** Wait for the wallet surface to finish closing before resuming the originating action. */
export function completeDemoWalletConnection(connected: boolean) {
  const current = request;
  if (!current) return;
  request = undefined;
  listeners.forEach((listener) => listener());
  if (connected) current.resolve();
  else current.reject(new Error("Wallet connection cancelled."));
}
