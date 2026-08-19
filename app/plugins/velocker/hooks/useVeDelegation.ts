import { type Address } from "viem";
import { useReadContracts } from "wagmi";
import { PUB_CHAIN } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { escrowAdapterAbi } from "../artifacts/escrowAdapter";

/**
 * Delegation state on the escrow's IVotes adapter — NOT the token. An undelegated lock
 * carries no voting power at all: the adapter's delegatee defaults to address(0), and only
 * a `delegate()` call starts checkpointing the locks' weight. After the first call, new
 * locks auto-delegate to the same delegatee.
 */
export function useVeDelegation(address: Address | undefined, adapter: Address | undefined, onChanged?: () => void) {
  const { data, refetch } = useReadContracts({
    contracts: [
      { chainId: PUB_CHAIN.id, address: adapter, abi: escrowAdapterAbi, functionName: "delegates", args: [address!] },
      { chainId: PUB_CHAIN.id, address: adapter, abi: escrowAdapterAbi, functionName: "getVotes", args: [address!] },
    ],
    query: { enabled: !!address && !!adapter },
  });

  const { writeContract, isConfirming } = useTransactionManager({
    onSuccessMessage: "Lock voting power delegated",
    onErrorMessage: "Could not delegate the lock voting power",
    onSuccess: () => {
      void refetch();
      onChanged?.();
    },
  });

  const delegate = (target: Address) => {
    if (!adapter) return;
    writeContract({
      chainId: PUB_CHAIN.id,
      abi: escrowAdapterAbi,
      address: adapter,
      functionName: "delegate",
      args: [target],
    });
  };

  return {
    /** address(0) means the locks are inactive — no voting power until delegated. */
    delegatesTo: data?.[0].result as Address | undefined,
    /** Escrow-lock votes delegated to this account (excludes bonded/wallet sources). */
    lockVotes: data?.[1].result as bigint | undefined,
    delegate,
    delegateToSelf: () => address && delegate(address),
    isConfirming,
    refetch,
  };
}
