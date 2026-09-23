import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { demoSdk } from "@/dev/fixtures";
import { PUB_CRISP_SERVER_URL } from "@/constants";
import { CrispSDK } from "@crisp-e3/sdk";

// The SDK's own chain reads still go through viem's default public endpoint. Routing them through
// the CRISP server's `/chain/rpc` route needs an SDK release carrying the constructor's `rpcUrl`
// parameter — the pinned version has none, so passing one is a type error. Everything wagmi reads
// already goes through PUB_WEB3_ENDPOINT; this is the remaining gap.
export const crispSdk = DESIGN_PREVIEW ? demoSdk() : new CrispSDK(PUB_CRISP_SERVER_URL);
