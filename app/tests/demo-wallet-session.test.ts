import { afterEach, describe, expect, test } from "bun:test";
import { connect, disconnect, getAccount, reconnect, watchAccount } from "@wagmi/core";
import { createConfig } from "wagmi";
import { PUB_CHAIN } from "../constants";
import { demoConnector } from "../dev/demoConnector";
import { demoTransport } from "../dev/fixtures";
import { DEMO_WALLET, DESIGN_PREVIEW } from "../dev/previewMode";
import {
  DEMO_SENDING_WALLET,
  selectDemoAccount,
  isDemoWalletDisconnected,
  setDemoWalletDisconnected,
} from "../dev/demoWalletSession";
import { demoState, getDemoRequest } from "../dev/simulation";
import { createDelegateConnection } from "../plugins/velocker/utils/delegateConnection";

const makeConfig = () =>
  createConfig({
    chains: [PUB_CHAIN],
    transports: { [PUB_CHAIN.id]: demoTransport() },
    connectors: [demoConnector()],
    storage: null,
    multiInjectedProviderDiscovery: false,
    ssr: true,
  });

describe.skipIf(!DESIGN_PREVIEW)("Demo wallet connection controls", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    setDemoWalletDisconnected(false);
  });

  test("disconnect exposes the anonymous page state until an explicit reconnect, preserving demo data", async () => {
    const config = makeConfig();
    const connector = config.connectors[0];
    await connect(config, { connector });
    const savedDemo = structuredClone(demoState());
    const provider = (await connector.getProvider()) as {
      request: (input: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
    expect(getAccount(config).address).toBe(DEMO_WALLET);

    await disconnect(config);
    expect(getAccount(config).status).toBe("disconnected");
    expect(getAccount(config).address).toBeUndefined();
    expect(isDemoWalletDisconnected()).toBe(true);
    expect(await connector.isAuthorized()).toBe(false);
    expect(await connector.getAccounts()).toEqual([]);
    expect(await provider.request({ method: "eth_accounts" })).toEqual([]);
    await expect(provider.request({ method: "personal_sign", params: ["0x1234", DEMO_WALLET] })).rejects.toThrow(
      "Connect the demo wallet first."
    );
    expect(getDemoRequest()).toBeNull();

    await reconnect(config);
    expect(getAccount(config).status).toBe("disconnected");
    // A remounted header/mobile menu gets a new connector, but the same explicit choice.
    const remounted = makeConfig();
    await reconnect(remounted);
    expect(getAccount(remounted).status).toBe("disconnected");

    await connect(remounted, { connector: remounted.connectors[0] });
    expect(getAccount(remounted).isConnected).toBe(true);
    expect(getAccount(remounted).address).toBe(DEMO_WALLET);
    expect(isDemoWalletDisconnected()).toBe(false);
    expect(demoState()).toEqual(savedDemo);
  });

  test("a fresh runtime honours the persisted disconnect after a page reload", async () => {
    const saved = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: new EventTarget().addEventListener.bind(new EventTarget()),
        location: { hostname: "localhost" },
        sessionStorage: {
          getItem: (key: string) => saved.get(key) ?? null,
          setItem: (key: string, value: string) => saved.set(key, value),
        },
      },
    });
    const config = makeConfig();
    await connect(config, { connector: config.connectors[0] });
    await disconnect(config);

    // Reloading discards module memory, retaining only sessionStorage from the same tab.
    const result = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `const saved = new Map(JSON.parse(process.argv.at(-1)));
         globalThis.window = {
           location: { hostname: "localhost" },
           sessionStorage: { getItem: key => saved.get(key) ?? null }
         };
         const { isDemoWalletDisconnected } = await import("./dev/demoWalletSession");
         if (!isDemoWalletDisconnected()) throw new Error("Reload re-enabled automatic connection");`,
        JSON.stringify([...saved]),
      ],
      { cwd: process.cwd(), env: { ...process.env } }
    );
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("connecting from a delegate selection resumes review without changing locks or delegation", async () => {
    const config = makeConfig();
    setDemoWalletDisconnected(true);
    const target = "0x0000000000000000000000000000000000000012" as const;
    const savedDemo = structuredClone(demoState());
    const reviews: (string | undefined)[] = [];
    const request = createDelegateConnection(
      target,
      (selected) => reviews.push(selected),
      () => {}
    );
    const stop = watchAccount(config, {
      onChange: (account) => request.update({ connected: account.isConnected, modalOpen: false }),
    });
    try {
      await connect(config, { connector: config.connectors[0] });
      expect(getAccount(config).address).toBe(DEMO_WALLET);
      expect(reviews).toEqual([target]);
      expect(demoState()).toEqual(savedDemo);
      expect(getDemoRequest()).toBeNull();
    } finally {
      stop();
      request.dispose();
    }
  });

  test("disconnect still works if sessionStorage stops accepting writes", async () => {
    const saved = new Map<string, string>();
    let readonly = false;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: new EventTarget().addEventListener.bind(new EventTarget()),
        location: { hostname: "localhost" },
        sessionStorage: {
          getItem: (key: string) => saved.get(key) ?? null,
          setItem: (key: string, value: string) => {
            if (readonly) throw new Error("Storage unavailable");
            saved.set(key, value);
          },
        },
      },
    });
    const config = makeConfig();
    await connect(config, { connector: config.connectors[0] });
    readonly = true;
    await disconnect(config);
    await reconnect(config);
    expect(getAccount(config).status).toBe("disconnected");
    expect(isDemoWalletDisconnected()).toBe(true);
    await connect(config, { connector: config.connectors[0] });
    expect(getAccount(config).address).toBe(DEMO_WALLET);
  });
  test("selecting a demo account is explicit, idempotent and survives reconnect", async () => {
    const saved = new Map<string, string>();
    const target = new EventTarget();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { hostname: "localhost" },
        addEventListener: target.addEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
        sessionStorage: {
          getItem: (key: string) => saved.get(key) ?? null,
          setItem: (key: string, value: string) => saved.set(key, value),
        },
      },
    });
    const config = makeConfig();
    await connect(config, { connector: config.connectors[0] });
    selectDemoAccount(DEMO_SENDING_WALLET);
    expect(getAccount(config).address?.toLowerCase()).toBe(DEMO_SENDING_WALLET.toLowerCase());
    selectDemoAccount(DEMO_SENDING_WALLET);
    expect(getAccount(config).address?.toLowerCase()).toBe(DEMO_SENDING_WALLET.toLowerCase());
    await disconnect(config);
    await connect(config, { connector: config.connectors[0] });
    expect(getAccount(config).address?.toLowerCase()).toBe(DEMO_SENDING_WALLET.toLowerCase());
    selectDemoAccount(DEMO_WALLET);
    expect(getAccount(config).address).toBe(DEMO_WALLET);
  });
});
