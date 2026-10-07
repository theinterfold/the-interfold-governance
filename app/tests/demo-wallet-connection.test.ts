import { afterEach, describe, expect, test } from "bun:test";
import { DESIGN_PREVIEW } from "../dev/previewMode";
import {
  requestDemoWalletConnection,
  completeDemoWalletConnection,
  getDemoWalletConnectionOpen,
} from "../dev/demoWalletConnection";

describe.skipIf(!DESIGN_PREVIEW)("Explicit demo wallet connection", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  afterEach(() => {
    completeDemoWalletConnection(false);
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  function host() {
    const target = new EventTarget();
    let opened = 0;
    target.addEventListener("interfold-demo-wallet-connect", () => opened++);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { hostname: "localhost" }, dispatchEvent: target.dispatchEvent.bind(target) },
    });
    return () => opened;
  }

  test("opening a connection waits for an explicit choice and for the dialog to close", async () => {
    const opens = host();
    const promise = requestDemoWalletConnection();
    let continued = false;
    void promise.then(() => {
      continued = true;
    });
    await Promise.resolve();
    expect(opens()).toBe(1);
    expect(getDemoWalletConnectionOpen()).toBe(true);
    expect(continued).toBe(false);
    expect(requestDemoWalletConnection()).toBe(promise);
    expect(opens()).toBe(1);
    completeDemoWalletConnection(true);
    await promise;
    expect(continued).toBe(true);
    expect(getDemoWalletConnectionOpen()).toBe(false);
  });

  test("cancellation cannot resume an old action after a later connection", async () => {
    host();
    const cancelled = requestDemoWalletConnection();
    void cancelled.catch(() => {});
    completeDemoWalletConnection(false);
    await expect(cancelled).rejects.toThrow("Wallet connection cancelled");
    expect(getDemoWalletConnectionOpen()).toBe(false);
    const retry = requestDemoWalletConnection();
    expect(retry).not.toBe(cancelled);
    completeDemoWalletConnection(true);
    await retry;
  });
});
