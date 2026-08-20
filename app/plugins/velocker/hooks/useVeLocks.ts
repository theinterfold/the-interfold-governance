import { useCallback, useEffect, useState } from "react";
import { type Address } from "viem";
import { usePublicClient } from "wagmi";
import { PUB_VE_LOCKER_ADDRESS } from "@/constants";
import { votingEscrowAbi } from "../artifacts/votingEscrow";
import { escrowAdapterAbi } from "../artifacts/escrowAdapter";
import { exitQueueAbi } from "../artifacts/exitQueue";

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
 * The connected wallet's lock positions, in both states — no event scans:
 *  - owned: `escrow.ownedTokens(account)` walks the lock NFT's enumeration on-chain;
 *  - queued: `beginWithdrawal` transfers the NFT to the ESCROW and `withdraw` burns it, so
 *    `escrow.ownedTokens(escrow)` is exactly the current global cooldown queue — filtered
 *    to this account by each ticket's live `ticketHolder`.
 */
export function useVeLocks(address: Address | undefined, satellites: { queue?: Address; adapter?: Address }) {
  const publicClient = usePublicClient();
  const { queue, adapter } = satellites;
  const [ownedLocks, setOwnedLocks] = useState<OwnedLock[]>([]);
  const [queuedExits, setQueuedExits] = useState<QueuedExit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!publicClient || !address || !queue || !adapter) return;
      try {
        setIsLoading(true);
        setError(null);

        const [ownedIds, escrowHeldIds] = (await publicClient.multicall({
          allowFailure: false,
          contracts: [
            { address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "ownedTokens", args: [address] },
            {
              address: PUB_VE_LOCKER_ADDRESS,
              abi: votingEscrowAbi,
              functionName: "ownedTokens",
              args: [PUB_VE_LOCKER_ADDRESS],
            },
          ],
        })) as [readonly bigint[], readonly bigint[]];
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

        const queuedReads = escrowHeldIds.length
          ? ((await publicClient.multicall({
              allowFailure: true,
              contracts: escrowHeldIds.flatMap((id) => [
                { address: queue, abi: exitQueueAbi, functionName: "ticketHolder", args: [id] },
                { address: queue, abi: exitQueueAbi, functionName: "queue", args: [id] },
                { address: queue, abi: exitQueueAbi, functionName: "canExit", args: [id] },
                { address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "locked", args: [id] },
              ]) as any,
            })) as { result?: unknown }[])
          : [];
        if (cancelled) return;

        const queued: QueuedExit[] = escrowHeldIds
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
  }, [publicClient, address, queue, adapter, refreshKey]);

  return { ownedLocks, queuedExits, isLoading, error, refetch };
}
