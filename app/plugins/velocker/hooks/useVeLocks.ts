import { useCallback, useEffect, useState } from "react";
import { parseAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { PUB_TOKEN_DEPLOYMENT_BLOCK, PUB_VE_LOCKER_ADDRESS } from "@/constants";
import { votingEscrowAbi } from "../artifacts/votingEscrow";
import { escrowAdapterAbi } from "../artifacts/escrowAdapter";
import { lockNftAbi } from "../artifacts/lockNft";
import { exitQueueAbi } from "../artifacts/exitQueue";

const exitQueuedEvent = parseAbiItem(
  "event ExitQueued(uint256 indexed tokenId, address indexed holder, uint256 exitDate)"
);

// Keep each getLogs range small enough for public RPCs that cap eth_getLogs.
const CHUNK = 9_000n;

export type OwnedLock = {
  tokenId: bigint;
  amount: bigint;
  start: number;
  votingPower: bigint;
  delegated: boolean;
};

export type QueuedExit = {
  tokenId: bigint;
  amount: bigint;
  /** Unix seconds after which `withdraw` succeeds. */
  exitDate: number;
  canExit: boolean;
};

/**
 * The connected wallet's lock positions, in both states:
 *  - owned: the lock NFT sits in the wallet (enumerated off the NFT, no events needed);
 *  - queued: `beginWithdrawal` moved the NFT into the escrow, so ownership no longer points at
 *    the wallet — those are recovered from `ExitQueued` logs and confirmed against the live
 *    ticket holder, so a withdrawn or cancelled exit drops out.
 */
export function useVeLocks(
  address: Address | undefined,
  satellites: { lockNft?: Address; queue?: Address; adapter?: Address }
) {
  const publicClient = usePublicClient();
  const { lockNft, queue, adapter } = satellites;
  const [ownedLocks, setOwnedLocks] = useState<OwnedLock[]>([]);
  const [queuedExits, setQueuedExits] = useState<QueuedExit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!publicClient || !address || !lockNft || !queue || !adapter) return;
      try {
        setIsLoading(true);
        setError(null);

        // 1. Locks still in the wallet: plain ERC721Enumerable, no log scan.
        const balance = (await publicClient.readContract({
          address: lockNft,
          abi: lockNftAbi,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;

        const indexCalls = Array.from({ length: Number(balance) }, (_, i) => ({
          address: lockNft,
          abi: lockNftAbi,
          functionName: "tokenOfOwnerByIndex",
          args: [address, BigInt(i)],
        }));
        const ownedIds = balance
          ? ((await publicClient.multicall({ allowFailure: false, contracts: indexCalls as any })) as bigint[])
          : [];
        if (cancelled) return;

        const ownedReads = ownedIds.length
          ? ((await publicClient.multicall({
              allowFailure: true,
              contracts: ownedIds.flatMap((id) => [
                { address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "locked", args: [id] },
                { address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "votingPower", args: [id] },
                { address: adapter, abi: escrowAdapterAbi, functionName: "tokenIsDelegated", args: [id] },
              ]) as any,
            })) as { result?: unknown }[])
          : [];
        if (cancelled) return;

        const owned: OwnedLock[] = ownedIds.map((tokenId, i) => {
          const locked = ownedReads[i * 3]?.result as { amount: bigint; start: number } | undefined;
          return {
            tokenId,
            amount: locked?.amount ?? 0n,
            start: Number(locked?.start ?? 0),
            votingPower: (ownedReads[i * 3 + 1]?.result as bigint | undefined) ?? 0n,
            delegated: (ownedReads[i * 3 + 2]?.result as boolean | undefined) ?? false,
          };
        });

        // 2. Locks in the exit queue: the NFT was transferred to the escrow, so enumeration by
        //    owner cannot see them. ExitQueued names the ticket holder; the live ticketHolder
        //    check drops anything since withdrawn or cancelled.
        const latest = await publicClient.getBlockNumber();
        const start = BigInt(PUB_TOKEN_DEPLOYMENT_BLOCK || 0);
        const candidateIds = new Set<bigint>();
        for (let from = start; from <= latest; from += CHUNK + 1n) {
          const to = from + CHUNK > latest ? latest : from + CHUNK;
          const logs = await publicClient.getLogs({
            address: queue,
            event: exitQueuedEvent,
            args: { holder: address },
            fromBlock: from,
            toBlock: to,
          });
          for (const log of logs) {
            const tokenId = (log.args as { tokenId?: bigint }).tokenId;
            if (tokenId !== undefined) candidateIds.add(tokenId);
          }
          if (cancelled) return;
        }

        const queuedIds = Array.from(candidateIds);
        const queuedReads = queuedIds.length
          ? ((await publicClient.multicall({
              allowFailure: true,
              contracts: queuedIds.flatMap((id) => [
                { address: queue, abi: exitQueueAbi, functionName: "ticketHolder", args: [id] },
                { address: queue, abi: exitQueueAbi, functionName: "queue", args: [id] },
                { address: queue, abi: exitQueueAbi, functionName: "canExit", args: [id] },
                { address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "locked", args: [id] },
              ]) as any,
            })) as { result?: unknown }[])
          : [];
        if (cancelled) return;

        const queued: QueuedExit[] = queuedIds
          .map((tokenId, i) => {
            const holder = queuedReads[i * 4]?.result as Address | undefined;
            const ticket = queuedReads[i * 4 + 1]?.result as { holder: Address; exitDate: bigint } | undefined;
            const locked = queuedReads[i * 4 + 3]?.result as { amount: bigint; start: number } | undefined;
            return {
              tokenId,
              amount: locked?.amount ?? 0n,
              exitDate: Number(ticket?.exitDate ?? 0n),
              canExit: (queuedReads[i * 4 + 2]?.result as boolean | undefined) ?? false,
              isMine: !!holder && holder.toLowerCase() === address.toLowerCase(),
            };
          })
          .filter((t) => t.isMine)
          .map(({ isMine: _isMine, ...t }) => t);

        setOwnedLocks(owned);
        setQueuedExits(queued);
      } catch {
        if (!cancelled) setError("Could not load your locks");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address, lockNft, queue, adapter, refreshKey]);

  return { ownedLocks, queuedExits, isLoading, error, refetch };
}
