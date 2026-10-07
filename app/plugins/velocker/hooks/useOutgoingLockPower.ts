import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { PUB_CHAIN, PUB_ENABLE_LOCKING, PUB_VE_LOCKER_ADDRESS } from "@/constants";
import { votingEscrowAbi } from "../artifacts/votingEscrow";
import { escrowAdapterAbi } from "../artifacts/escrowAdapter";
import { useVeEscrow } from "./useVeEscrow";
import { delegatedLockPower } from "../utils/delegatedLockPower";

/** Current outgoing power. This is deliberately not labelled as historical snapshot data. */
export function useOutgoingLockPower(owner?: Address, delegate?: Address) {
  const { adapter } = useVeEscrow();
  const needsLocks = PUB_ENABLE_LOCKING && !!owner && !!delegate && delegatedLockPower(owner, delegate) !== 0n;
  const ids = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_VE_LOCKER_ADDRESS,
    abi: votingEscrowAbi,
    functionName: "ownedTokens",
    args: [owner!],
    query: { enabled: needsLocks },
  });
  const values = useReadContracts({
    contracts: (ids.data ?? []).flatMap(
      (id) =>
        [
          {
            chainId: PUB_CHAIN.id,
            address: PUB_VE_LOCKER_ADDRESS,
            abi: votingEscrowAbi,
            functionName: "votingPower",
            args: [id],
          },
          {
            chainId: PUB_CHAIN.id,
            address: adapter,
            abi: escrowAdapterAbi,
            functionName: "tokenIsDelegated",
            args: [id],
          },
        ] as const
    ),
    query: { enabled: needsLocks && !!adapter && !!ids.data?.length },
  });
  if (!PUB_ENABLE_LOCKING) return undefined;
  if (!needsLocks) return delegatedLockPower(owner, delegate);
  if (ids.isError || !ids.data) return undefined;
  if (ids.data.length === 0) return 0n;
  if (values.isError || !values.data || values.data.some((value) => value.status !== "success")) return undefined;
  return delegatedLockPower(
    owner,
    delegate,
    ids.data.map((_, index) => ({
      votingPower: values.data![index * 2].result as bigint,
      delegated: values.data![index * 2 + 1].result as boolean,
    }))
  );
}
