import { useEffect, useMemo, useState } from "react";
import { erc20Abi, isAddress, isAddressEqual, zeroAddress, type Address } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { PUB_BONDED_VOTES_ADDRESS, PUB_CHAIN, PUB_TOKEN_ADDRESS } from "@/constants";
import { bondedCheckpointsAbi, bondedVotesAbi } from "@/artifacts/bondedVotes";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { awaitSuccessfulReceipt } from "@/plugins/crispVoting/utils/awaitReceipt";
import { describeFailure } from "@/plugins/crispVoting/utils/describeFailure";
import { foldLockAbi } from "@/plugins/velocker/artifacts/foldLock";
import { bondedWeight } from "@/utils/bondedDelegation";

/** Which control an action came from, so that its spinner and its error show at that control. */
export type BondedAction = "cancel" | "stop";

export type BondedDelegation = {
  /** False until the adapter answers `MAX_BONDED_OWNERS`. Every bonded delegation control hides while false. */
  supported: boolean;
  /** Vesting FOLD is part of the bonded weight: the adapter reads an escrow, not the token. */
  countsVesting: boolean;
  /** The bonded voting power of the account: the weight that a delegate takes while one represents the account. */
  ownWeight?: bigint;
  /** The address that the account asked to represent it, while that address has not answered. */
  pendingDelegate?: Address;
  /** The address that represents the account now. Undefined while the account keeps its weight. */
  delegate?: Address;
  /** The bonded weight of the owners that the account represents: zero when bonded delegation is unsupported, undefined while unknown. */
  representedWeight?: bigint;
  /** The control whose transaction is in flight. */
  pendingAction?: BondedAction;
  /** The last failed action and why it failed. */
  failure?: { action: BondedAction; message: string };
  /** Withdraws the pending request. True on success. */
  cancelRequest: () => Promise<boolean>;
  /** Takes the voting power back from the delegate. True on success. */
  stop: () => Promise<boolean>;
};

const configured = isAddress(PUB_BONDED_VOTES_ADDRESS);

/**
 * Gas added to the estimate of every bonded delegation change. A change pushes at most two
 * checkpoints at `clock()`, and a node estimates at the timestamp of the latest block. If that block
 * already wrote the same checkpoints, the estimate prices two updates in place. The transaction
 * lands in a later block and pushes two new entries instead. Unused gas is refunded.
 */
const CHECKPOINT_GAS_MARGIN = 50_000n;

/**
 * The bonded voting power of an account on `BondedVotes`. It counts for the account while no other
 * address represents it. An account that handed it to another address earlier can withdraw the
 * pending request or stop the delegation, and the voting power counts for the account again.
 *
 * The hook also reads the owners that the account represents, so that `representedWeight` keeps the
 * voting-power breakdown correct.
 *
 * An adapter deployed before bonded delegation reverts on `MAX_BONDED_OWNERS`, so `supported`
 * stays false and the app keeps every bonded delegation control hidden.
 *
 * @param onChanged Called after a delegation change, for reads that this hook does not own.
 */
export function useBondedDelegation(address: Address | undefined, onChanged?: () => void): BondedDelegation {
  const client = usePublicClient();
  const [pendingAction, setPendingAction] = useState<BondedAction | undefined>(undefined);
  const [failure, setFailure] = useState<{ action: BondedAction; message: string } | undefined>(undefined);

  useEffect(() => {
    setFailure(undefined);
  }, [address]);

  // An adapter without bonded delegation reverts here, and asking again will not change that.
  const probe = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_BONDED_VOTES_ADDRESS,
    abi: bondedVotesAbi,
    functionName: "MAX_BONDED_OWNERS",
    query: { enabled: configured, retry: false },
  });
  const supported = probe.data !== undefined;
  const probeSettled = !configured || probe.status !== "pending";

  const state = useReadContracts({
    contracts: [
      {
        chainId: PUB_CHAIN.id,
        address: PUB_BONDED_VOTES_ADDRESS,
        abi: bondedVotesAbi,
        functionName: "pendingBondedDelegate",
        args: [address!],
      },
      {
        chainId: PUB_CHAIN.id,
        address: PUB_BONDED_VOTES_ADDRESS,
        abi: bondedVotesAbi,
        functionName: "bondedDelegate",
        args: [address!],
      },
      {
        chainId: PUB_CHAIN.id,
        address: PUB_BONDED_VOTES_ADDRESS,
        abi: bondedVotesAbi,
        functionName: "bondedOwners",
        args: [address!],
      },
      { chainId: PUB_CHAIN.id, address: PUB_BONDED_VOTES_ADDRESS, abi: bondedVotesAbi, functionName: "checkpoints" },
      { chainId: PUB_CHAIN.id, address: PUB_BONDED_VOTES_ADDRESS, abi: bondedVotesAbi, functionName: "escrow" },
    ],
    query: { enabled: supported && !!address },
  });
  const pending = state.data?.[0].result;
  const current = state.data?.[1].result;
  const ownersResult = state.data?.[2].result;
  const ownerAddresses = useMemo(() => [...(ownersResult ?? [])], [ownersResult]);
  const checkpoints = state.data?.[3].result;
  const escrow = state.data?.[4].result;
  // Vesting FOLD is part of the bonded weight only when the adapter reads an escrow. When it reads
  // the token, vesting FOLD is wallet FOLD and follows the token's own delegation.
  const countsVesting = !!escrow && !isAddressEqual(escrow, zeroAddress);

  // The voting power each account moves: the connected account's own and the owners that it represents.
  const accounts = useMemo(() => {
    const all = address ? [address, ...ownerAddresses] : [];
    return Array.from(new Map(all.map((account) => [account.toLowerCase(), account])).values());
  }, [address, ownerAddresses]);
  const stride = countsVesting ? 3 : 1;
  const weightReads = useReadContracts({
    contracts: accounts.flatMap((account) => [
      {
        chainId: PUB_CHAIN.id,
        address: checkpoints,
        abi: bondedCheckpointsAbi,
        functionName: "bonded" as const,
        args: [account] as const,
      },
      ...(countsVesting
        ? [
            {
              chainId: PUB_CHAIN.id,
              address: PUB_TOKEN_ADDRESS,
              abi: foldLockAbi,
              functionName: "lockedBalanceOf" as const,
              args: [account] as const,
            },
            {
              chainId: PUB_CHAIN.id,
              address: PUB_TOKEN_ADDRESS,
              abi: erc20Abi,
              functionName: "balanceOf" as const,
              args: [account] as const,
            },
          ]
        : []),
    ]),
    query: { enabled: supported && !!checkpoints && escrow !== undefined && accounts.length > 0 },
  });

  const weights = new Map<string, bigint | undefined>();
  accounts.forEach((account, i) => {
    const read = (offset: number) => weightReads.data?.[i * stride + offset]?.result as bigint | undefined;
    const bonded = read(0);
    const locked = countsVesting ? read(1) : undefined;
    const held = countsVesting ? read(2) : undefined;
    let weight: bigint | undefined;
    if (bonded !== undefined && !countsVesting) weight = bondedWeight(bonded);
    else if (bonded !== undefined && locked !== undefined && held !== undefined) {
      weight = bondedWeight(bonded, { locked, held });
    }
    weights.set(account.toLowerCase(), weight);
  });

  // Unknown until the probe and the account's state are in, so that a breakdown never shows
  // represented weight as the account's own vesting while the owners load.
  let representedWeight: bigint | undefined;
  if (probeSettled && !supported) representedWeight = 0n;
  else if (state.data) {
    representedWeight = ownerAddresses.reduce<bigint | undefined>((sum, owner) => {
      const weight = weights.get(owner.toLowerCase());
      return sum === undefined || weight === undefined ? undefined : sum + weight;
    }, 0n);
  }

  const done = () => {
    onChanged?.();
    // Give the RPC a beat to serve the block that the receipt came from, then show the new state.
    // The action stays pending until then, so that nobody can use a control twice on stale state.
    setTimeout(() => {
      void Promise.all([state.refetch(), weightReads.refetch()]).finally(() => setPendingAction(undefined));
    }, 1000 * 2);
  };
  const failed = () => setPendingAction(undefined);

  const { writeContractAsync: cancelWrite } = useTransactionManager({
    onSuccessMessage: "Delegation request withdrawn",
    onSuccessDescription: "Your bonded voting power counts for you.",
    onErrorMessage: "Could not withdraw the delegation request",
    onSuccess: done,
    onError: failed,
  });
  const { writeContractAsync: stopWrite } = useTransactionManager({
    onSuccessMessage: "Delegation stopped",
    onSuccessDescription: "The voting power counts for you again.",
    onErrorMessage: "Could not stop the delegation",
    onSuccess: done,
    onError: failed,
  });

  const contract = { abi: bondedVotesAbi, address: PUB_BONDED_VOTES_ADDRESS } as const;

  /** `delegateBonded(0)` withdraws the pending request and ends the current delegation. */
  const release = async (
    action: BondedAction,
    write: typeof cancelWrite,
    label: string,
    fallback: string
  ): Promise<boolean> => {
    setFailure(undefined);
    setPendingAction(action);
    try {
      if (!client) throw new Error("No RPC client available");
      const call = { ...contract, functionName: "delegateBonded", args: [zeroAddress] } as const;
      // When this estimate fails, the write estimates again and fails with the same revert. That
      // failure gets the usual error alert.
      const gas = await client.estimateContractGas({ ...call, account: address }).then(
        (estimate) => estimate + CHECKPOINT_GAS_MARGIN,
        () => undefined
      );
      const tx = await write({ ...call, chainId: PUB_CHAIN.id, gas });
      await awaitSuccessfulReceipt(client, tx, label);
      return true;
    } catch (err) {
      const message = describeFailure(err, fallback);
      if (message) setFailure({ action, message });
      setPendingAction(undefined);
      // The delegation can change after the page loads. Read it again to show the current state.
      void state.refetch();
      return false;
    }
  };

  return {
    supported,
    countsVesting,
    ownWeight: address ? weights.get(address.toLowerCase()) : undefined,
    pendingDelegate: pending && !isAddressEqual(pending, zeroAddress) ? pending : undefined,
    delegate: current && !isAddressEqual(current, zeroAddress) ? current : undefined,
    representedWeight,
    pendingAction,
    failure,
    cancelRequest: () =>
      release("cancel", cancelWrite, "Withdrawing the request", "The delegation request could not be withdrawn"),
    stop: () => release("stop", stopWrite, "Stopping the delegation", "The delegation could not be stopped"),
  };
}
