import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { PUB_CHAIN } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { escrowAdapterAbi } from "../artifacts/escrowAdapter";
import { awaitSuccessfulReceipt } from "@/plugins/crispVoting/utils/awaitReceipt";
import { describeFailure } from "@/plugins/crispVoting/utils/describeFailure";

/**
 * Delegation state on the escrow's IVotes adapter — NOT the token. An undelegated lock
 * carries no voting power at all: the adapter's delegatee defaults to address(0), and only
 * a `delegate()` call starts checkpointing the locks' weight. `delegateToSelf` makes the
 * account vote with all its locks; after the first call, new locks auto-delegate to the
 * same delegatee. An account that delegated to another address earlier takes its locks
 * back with the same call.
 */
export function useVeDelegation(address: Address | undefined, adapter: Address | undefined, onChanged?: () => void) {
  const client = usePublicClient({ chainId: PUB_CHAIN.id });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  useEffect(() => setError(undefined), [address]);
  const {
    data,
    error: queryError,
    refetch,
  } = useReadContracts({
    contracts: [
      { chainId: PUB_CHAIN.id, address: adapter, abi: escrowAdapterAbi, functionName: "delegates", args: [address!] },
      { chainId: PUB_CHAIN.id, address: adapter, abi: escrowAdapterAbi, functionName: "getVotes", args: [address!] },
    ],
    query: { enabled: !!address && !!adapter },
  });
  const readError =
    queryError ??
    (data?.some((result) => result.status === "failure") ? new Error("Delegation data could not be read") : null);

  const { writeContractAsync } = useTransactionManager({
    onSuccessMessage: "Voting power activated",
    onErrorMessage: "Could not activate voting power",
  });

  const delegateToSelf = async (): Promise<boolean> => {
    if (!adapter || !address || submitting.current) return false;
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
        args: [address],
      });
      await awaitSuccessfulReceipt(client, hash, "The activation");
      void refetch();
      onChanged?.();
      return true;
    } catch (err) {
      setError(describeFailure(err, "The activation could not be completed"));
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
    delegateToSelf,
    isConfirming: pending,
    error,
    readError,
    retryRead: refetch,
    refetch,
  };
}
