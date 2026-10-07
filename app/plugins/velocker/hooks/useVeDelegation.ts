import { useEffect, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { PUB_CHAIN } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { escrowAdapterAbi } from "../artifacts/escrowAdapter";
import { awaitSuccessfulReceipt } from "@/plugins/crispVoting/utils/awaitReceipt";
import { describeFailure } from "@/plugins/crispVoting/utils/describeFailure";

/**
 * Delegation state on the escrow's IVotes adapter — NOT the token. An undelegated lock
 * carries no voting power at all: the adapter's delegatee defaults to address(0), and only
 * a `delegate()` call starts checkpointing the locks' weight. After the first call, new
 * locks auto-delegate to the same delegatee.
 */
export function useVeDelegation(address: Address | undefined, adapter: Address | undefined, onChanged?: () => void) {
  const client = usePublicClient({ chainId: PUB_CHAIN.id });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  useEffect(() => setError(undefined), [address]);
  const { data, refetch } = useReadContracts({
    contracts: [
      { chainId: PUB_CHAIN.id, address: adapter, abi: escrowAdapterAbi, functionName: "delegates", args: [address!] },
      { chainId: PUB_CHAIN.id, address: adapter, abi: escrowAdapterAbi, functionName: "getVotes", args: [address!] },
    ],
    query: { enabled: !!address && !!adapter },
  });

  const { writeContractAsync } = useTransactionManager({
    onSuccessMessage: "Voting delegate updated",
    onErrorMessage: "Could not update the voting delegate",
  });

  const delegate = async (target: Address): Promise<boolean> => {
    // address(0) explicitly removes delegation from all of this owner's locks.
    if (!adapter || !address || !isAddress(target) || submitting.current) return false;
    submitting.current = true;
    setPending(true);
    setError(undefined);
    try {
      if (!client) throw new Error("No RPC client available");
      const hash = await writeContractAsync({
        chainId: PUB_CHAIN.id,
        abi: escrowAdapterAbi,
        address: adapter,
        functionName: "delegate",
        args: [target],
      });
      await awaitSuccessfulReceipt(client, hash, "The delegation");
      void refetch();
      onChanged?.();
      return true;
    } catch (err) {
      setError(describeFailure(err, "The delegation could not be completed"));
      return false;
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return {
    /** address(0) means the locks are inactive — no voting power until delegated. */
    delegatesTo: data?.[0].result as Address | undefined,
    /** Escrow-lock votes delegated to this account (excludes bonded/wallet sources). */
    lockVotes: data?.[1].result as bigint | undefined,
    delegate,
    delegateToSelf: () => address && delegate(address),
    isConfirming: pending,
    error,
    refetch,
  };
}
