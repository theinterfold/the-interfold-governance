import { readTransport } from "@/context/Web3Modal";
import { createPublicClient } from "viem";
import { sepolia } from "viem/chains";

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: readTransport,
});
