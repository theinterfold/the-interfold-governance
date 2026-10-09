import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, getAddress, isAddress, isAddressEqual, zeroAddress, type Address } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { PUB_BONDED_VOTES_ADDRESS, PUB_BONDED_VOTES_DEPLOYMENT_BLOCK, PUB_CHAIN, PUB_TOKEN_ADDRESS } from "@/constants";
import { bondedCheckpointsAbi, bondedDelegationRequestedEvent, bondedVotesAbi } from "@/artifacts/bondedVotes";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { awaitSuccessfulReceipt } from "@/plugins/crispVoting/utils/awaitReceipt";
import { describeFailure } from "@/plugins/crispVoting/utils/describeFailure";
import { foldLockAbi } from "@/plugins/velocker/artifacts/foldLock";
import { bondedWeight } from "@/utils/bondedDelegation";
import { scanLogs } from "@/utils/logScan";

/**
 * An owner and the voting power that its bonded delegation moves. `weight` is `bonded` plus
 * `vesting`. Each part is undefined while unknown.
 */
export type BondedAccount = { address: Address; weight?: bigint; bonded?: bigint; vesting?: bigint };

/** Which control an action came from, so that its spinner and its error show at that control. */
export type BondedAction = "request" | "cancel" | "stop" | `accept:${string}` | `drop:${string}`;

export type BondedDelegation = {
  /** False until the adapter answers `MAX_BONDED_OWNERS`. Every bonded delegation control hides while false. */
  supported: boolean;
  /** Vesting FOLD is part of the bonded weight: the adapter reads an escrow, not the token. */
  countsVesting: boolean;
  /** How many owners one delegate can represent at a time. */
  maxOwners?: number;
  /** The bonded voting power of the account: the weight that a delegate takes while one represents the account. */
  ownWeight?: bigint;
  /** The address that the account asked to represent it, while that address has not answered. */
  pendingDelegate?: Address;
  /** The address that represents the account now. Undefined while the account keeps its weight. */
  delegate?: Address;
  /** The owners that the account represents. */
  owners: BondedAccount[];
  /** The owners that asked the account to represent them and wait for its answer. */
  requests: BondedAccount[];
  /** The sum of `owners[].weight`: zero when bonded delegation is unsupported, undefined while unknown. */
  representedWeight?: bigint;
  /** The control whose transaction is in flight. */
  pendingAction?: BondedAction;
  /** The last failed action and why it failed. */
  failure?: { action: BondedAction; message: string };
  /** Asks `delegatee` to represent the account. Ends a current delegation at once. True on success. */
  request: (delegatee: Address) => Promise<boolean>;
  /** Withdraws the pending request. True on success. */
  cancelRequest: () => Promise<boolean>;
  /** Takes the voting power back from the delegate. True on success. */
  stop: () => Promise<boolean>;
  /** Represents `owner`, which asked the account. True on success. */
  accept: (owner: Address) => Promise<boolean>;
  /** Gives the voting power of `owner` back to it. True on success. */
  drop: (owner: Address) => Promise<boolean>;
};

const configured = isAddress(PUB_BONDED_VOTES_ADDRESS);

/**
 * Gas added to the estimate of every bonded delegation change. A change pushes at most two
 * checkpoints at `clock()`, and a node estimates at the timestamp of the latest block. If that block
 * already wrote the same checkpoints, the estimate prices two updates in place. The transaction
 * lands in a later block and pushes two new entries instead. On a mainnet fork, a return right after
 * an accept estimated 45,067 gas and needed 89,601. Unused gas is refunded.
 */
const CHECKPOINT_GAS_MARGIN = 50_000n;

/**
 * Bonded delegation on `BondedVotes`, from both sides: the account as an owner that gives its
 * bonded weight to a delegate, and as a delegate that represents owners.
 *
 * An adapter deployed before bonded delegation reverts on `MAX_BONDED_OWNERS`, so `supported`
 * stays false and the app keeps every bonded delegation control hidden.
 *
 * Incoming requests have no on-chain list: they are found from the `BondedDelegationRequested` logs
 * that name the account, and kept only while `pendingBondedDelegate(owner)` still names it. An owner
 * can withdraw a request, replace it or have it accepted, and none of those emits a log for this
 * account.
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

  const requestsQuery = useQuery({
    queryKey: ["bonded-delegation-requests", PUB_CHAIN.id, PUB_BONDED_VOTES_ADDRESS, address],
    enabled: supported && !!address && !!client,
    queryFn: async (): Promise<Address[]> => {
      if (!client || !address) return [];
      const logs = await scanLogs(
        client,
        { address: PUB_BONDED_VOTES_ADDRESS, event: bondedDelegationRequestedEvent, args: { delegatee: address } },
        BigInt(PUB_BONDED_VOTES_DEPLOYMENT_BLOCK)
      );
      const candidates = Array.from(
        new Set(
          logs
            .map((log) => (log.args as { owner?: Address }).owner)
            .filter((owner): owner is Address => !!owner)
            .map((owner) => getAddress(owner))
        )
      );
      if (!candidates.length) return [];

      const asked = await client.multicall({
        allowFailure: false,
        contracts: candidates.map((owner) => ({
          address: PUB_BONDED_VOTES_ADDRESS,
          abi: bondedVotesAbi,
          functionName: "pendingBondedDelegate" as const,
          args: [owner] as const,
        })),
      });
      return candidates.filter((_, i) => isAddressEqual(asked[i], address));
    },
  });
  const requestAddresses = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);

  // The voting power each owner moves or would move: the connected account's own, the owners that
  // it represents, and the owners that wait for its answer.
  const accounts = useMemo(() => {
    const all = address ? [address, ...ownerAddresses, ...requestAddresses] : [];
    return Array.from(new Map(all.map((account) => [account.toLowerCase(), account])).values());
  }, [address, ownerAddresses, requestAddresses]);
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

  const weights = new Map<string, Omit<BondedAccount, "address">>();
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
    // The weight holds the bonded FOLD in full, so the rest of it is vesting FOLD.
    const vesting = weight === undefined || bonded === undefined ? undefined : weight - bonded;
    weights.set(account.toLowerCase(), { weight, bonded, vesting });
  });
  const withWeight = (owner: Address): BondedAccount => ({ address: owner, ...weights.get(owner.toLowerCase()) });

  const owners = ownerAddresses.map(withWeight);
  // A stale cached list can still hold an owner that this account accepted since.
  const requests = requestAddresses
    .filter((owner) => !ownerAddresses.some((represented) => isAddressEqual(represented, owner)))
    .map(withWeight);

  // Unknown until the probe and the account's state are in, so that a breakdown never shows
  // represented weight as the account's own vesting while the owners load.
  let representedWeight: bigint | undefined;
  if (probeSettled && !supported) representedWeight = 0n;
  else if (state.data) {
    representedWeight = owners.reduce<bigint | undefined>(
      (sum, owner) => (sum === undefined || owner.weight === undefined ? undefined : sum + owner.weight),
      0n
    );
  }

  const done = () => {
    onChanged?.();
    // Give the RPC a beat to serve the block that the receipt came from, then show the new state.
    // The action stays pending until then, so that nobody can use a control twice on stale state.
    setTimeout(() => {
      void Promise.all([state.refetch(), requestsQuery.refetch(), weightReads.refetch()]).finally(() =>
        setPendingAction(undefined)
      );
    }, 1000 * 2);
  };
  const failed = () => setPendingAction(undefined);

  const { writeContractAsync: requestWrite } = useTransactionManager({
    onSuccessMessage: "Delegation request sent",
    onSuccessDescription: "The voting power moves when the address accepts the request.",
    onErrorMessage: "Could not send the delegation request",
    onSuccess: done,
    onError: failed,
  });
  const { writeContractAsync: cancelWrite } = useTransactionManager({
    onSuccessMessage: "Delegation request withdrawn",
    onSuccessDescription: "The voting power stays with you.",
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
  const { writeContractAsync: acceptWrite } = useTransactionManager({
    onSuccessMessage: "Delegation accepted",
    onSuccessDescription: "You now vote with the voting power of this owner.",
    onErrorMessage: "Could not accept the delegation",
    onSuccess: done,
    onError: failed,
  });
  const { writeContractAsync: dropWrite } = useTransactionManager({
    onSuccessMessage: "Voting power returned",
    onSuccessDescription: "The owner votes with this voting power again.",
    onErrorMessage: "Could not return the voting power",
    onSuccess: done,
    onError: failed,
  });

  const contract = { abi: bondedVotesAbi, address: PUB_BONDED_VOTES_ADDRESS } as const;

  const send = async (
    action: BondedAction,
    write: typeof requestWrite,
    functionName: "delegateBonded" | "acceptBonded" | "dropBonded",
    args: readonly [Address],
    label: string,
    fallback: string
  ): Promise<boolean> => {
    setFailure(undefined);
    setPendingAction(action);
    try {
      if (!client) throw new Error("No RPC client available");
      const call = { ...contract, functionName, args };
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
      // The usual cause of a revert here is a list that went stale: the owner withdrew a request
      // or took its voting power back after the page loaded. Read it again to show that.
      void state.refetch();
      void requestsQuery.refetch();
      return false;
    }
  };

  return {
    supported,
    countsVesting,
    maxOwners: probe.data === undefined ? undefined : Number(probe.data),
    ownWeight: address ? weights.get(address.toLowerCase())?.weight : undefined,
    pendingDelegate: pending && !isAddressEqual(pending, zeroAddress) ? pending : undefined,
    delegate: current && !isAddressEqual(current, zeroAddress) ? current : undefined,
    owners,
    requests,
    representedWeight,
    pendingAction,
    failure,
    request: (delegatee) =>
      send(
        "request",
        requestWrite,
        "delegateBonded",
        [delegatee],
        "Sending the request",
        "The delegation request could not be sent"
      ),
    cancelRequest: () =>
      send(
        "cancel",
        cancelWrite,
        "delegateBonded",
        [zeroAddress],
        "Withdrawing the request",
        "The delegation request could not be withdrawn"
      ),
    stop: () =>
      send(
        "stop",
        stopWrite,
        "delegateBonded",
        [zeroAddress],
        "Stopping the delegation",
        "The delegation could not be stopped"
      ),
    accept: (owner) =>
      send(
        `accept:${owner}`,
        acceptWrite,
        "acceptBonded",
        [owner],
        "Accepting the request",
        "The delegation could not be accepted"
      ),
    drop: (owner) =>
      send(
        `drop:${owner}`,
        dropWrite,
        "dropBonded",
        [owner],
        "Returning the voting power",
        "The voting power could not be returned"
      ),
  };
}
