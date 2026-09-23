import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { demoTransport } from "@/dev/fixtures";
import { PUB_RPC_BATCH_SIZE, PUB_WEB3_ENDPOINT } from "@/constants";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: DESIGN_PREVIEW ? demoTransport() : http(PUB_WEB3_ENDPOINT, { batch: { batchSize: PUB_RPC_BATCH_SIZE } }),
});
