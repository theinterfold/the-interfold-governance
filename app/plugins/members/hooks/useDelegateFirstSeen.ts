import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import {
  PUB_DELEGATION_DEPLOYMENT_BLOCK,
  PUB_ENABLE_LOCKING,
  PUB_TOKEN_ADDRESS,
  PUB_VE_LOCKER_ADDRESS,
} from "@/constants";
import { votingEscrowAbi } from "@/plugins/velocker/artifacts/votingEscrow";
import { scanLogs } from "@/utils/logScan";
import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { firstDelegationBlocks } from "../utils/delegateOrder";

const event = parseAbiItem(
  "event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)"
);

/** Read history only when requested; the default power sort needs no extra scan. */
export function useDelegateFirstSeen(enabled: boolean, refreshKey: number) {
  const client = usePublicClient();
  return useQuery({
    queryKey: [
      "delegate-first-seen",
      client?.chain.id,
      PUB_VE_LOCKER_ADDRESS,
      PUB_TOKEN_ADDRESS,
      PUB_DELEGATION_DEPLOYMENT_BLOCK,
      refreshKey,
      DESIGN_PREVIEW,
    ],
    enabled: enabled && !!client,
    staleTime: 5 * 60_000,
    retry: false,
    select: (entries: [string, bigint][]) => new Map(entries),
    queryFn: async () => {
      if (DESIGN_PREVIEW) {
        const { demoDelegateFirstSeen } = await import("@/dev/fixtures");
        return Array.from(demoDelegateFirstSeen());
      }
      if (!client) throw new Error("Connect to the network to load delegation history.");
      const source = PUB_ENABLE_LOCKING
        ? ((await client.readContract({
            address: PUB_VE_LOCKER_ADDRESS,
            abi: votingEscrowAbi,
            functionName: "ivotesAdapter",
          })) as Address)
        : PUB_TOKEN_ADDRESS;
      const logs = await scanLogs(client, { address: source, event }, BigInt(PUB_DELEGATION_DEPLOYMENT_BLOCK || 0));
      return Array.from(
        firstDelegationBlocks(logs as { args: { toDelegate?: Address }; blockNumber: bigint | null }[])
      );
    },
  });
}
