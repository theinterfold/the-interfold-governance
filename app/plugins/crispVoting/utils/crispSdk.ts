import { PUB_CRISP_SERVER_URL } from "@/constants";
import { CrispSDK, SERVER_RPC } from "@crisp-e3/sdk";

// The SDK's own chain reads go through the CRISP server's `/chain/rpc` route, like everything wagmi
// reads (PUB_WEB3_ENDPOINT). Without an `rpcUrl` the SDK uses viem's default public endpoint, a
// third-party service that rate-limits per IP. The route serves only the contracts the server
// indexes; the one SDK read the app makes (`getOnChainRoundData`) targets the CRISP program, which
// it serves.
export const crispSdk = new CrispSDK(PUB_CRISP_SERVER_URL, SERVER_RPC);
