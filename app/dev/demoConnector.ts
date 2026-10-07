import { sendDemoTransaction, signDemoMessage } from "./simulation";
import { createConnector } from "wagmi";
import { DEMO_MESSAGE, requireLocalPreview } from "./previewMode";
import { getDemoAccount, isDemoWalletDisconnected, setDemoWalletDisconnected } from "./demoWalletSession";

/** No keys or upstream provider: supported requests run only in the local simulator. */
export function demoConnector() {
  return createConnector((config) => ({
    id: "interfold-design-preview",
    name: "Demo wallet",
    type: "design-preview",
    // The local provider validates supported actions before asking for a decision.
    // Avoid wagmi's separate eth_call preflight against the read-only fixtures.
    supportsSimulation: true,
    async setup() {
      if (typeof window !== "undefined")
        window.addEventListener("interfold-demo-account-changed", () => {
          if (!isDemoWalletDisconnected()) config.emitter.emit("change", { accounts: [getDemoAccount()] });
        });
    },
    async connect() {
      requireLocalPreview();
      setDemoWalletDisconnected(false);
      return { accounts: [getDemoAccount()], chainId: config.chains[0].id };
    },
    async disconnect() {
      setDemoWalletDisconnected(true);
    },
    async getAccounts() {
      requireLocalPreview();
      return isDemoWalletDisconnected() ? [] : [getDemoAccount()];
    },
    async getChainId() {
      return config.chains[0].id;
    },
    async isAuthorized() {
      try {
        requireLocalPreview();
        return !isDemoWalletDisconnected();
      } catch {
        return false;
      }
    },
    async getProvider() {
      requireLocalPreview();
      return {
        async request({ method, params }: { method: string; params?: unknown[] }) {
          requireLocalPreview();
          if (method === "eth_accounts" || method === "eth_requestAccounts")
            return isDemoWalletDisconnected() ? [] : [getDemoAccount()];
          if (method === "eth_chainId") return `0x${config.chains[0].id.toString(16)}`;
          if (isDemoWalletDisconnected()) {
            throw Object.assign(new Error("Connect the demo wallet first."), { code: 4100 });
          }
          if (method === "eth_sendTransaction" && params?.[0])
            return sendDemoTransaction(params[0] as Parameters<typeof sendDemoTransaction>[0]);
          if (["personal_sign", "eth_signTypedData_v4", "eth_signTypedData"].includes(method))
            return signDemoMessage(method, params);
          throw new Error(DEMO_MESSAGE);
        },
      };
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      setDemoWalletDisconnected(true);
      config.emitter.emit("disconnect");
    },
  }));
}
