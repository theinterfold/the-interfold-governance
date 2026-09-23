import { createConnector } from "wagmi";
import { DEMO_MESSAGE, DEMO_WALLET, requireLocalPreview } from "./previewMode";

/** No keys and no upstream provider: every signing or transaction request fails closed. */
export function demoConnector() {
  return createConnector((config) => ({
    id: "interfold-design-preview",
    name: "Demo wallet",
    type: "design-preview",
    async connect() {
      requireLocalPreview();
      return { accounts: [DEMO_WALLET], chainId: config.chains[0].id };
    },
    async disconnect() {},
    async getAccounts() {
      requireLocalPreview();
      return [DEMO_WALLET];
    },
    async getChainId() {
      return config.chains[0].id;
    },
    async isAuthorized() {
      try {
        requireLocalPreview();
        return true;
      } catch {
        return false;
      }
    },
    async getProvider() {
      requireLocalPreview();
      return {
        async request({ method }: { method: string }) {
          requireLocalPreview();
          if (method === "eth_accounts" || method === "eth_requestAccounts") return [DEMO_WALLET];
          if (method === "eth_chainId") return `0x${config.chains[0].id.toString(16)}`;
          throw new Error(DEMO_MESSAGE);
        },
      };
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}
