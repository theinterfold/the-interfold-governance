import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, isAddress, parseAbi, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS, PUB_VE_LOCKER_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { awaitSuccessfulReceipt } from "@/plugins/crispVoting/utils/awaitReceipt";
import { describeFailure } from "@/plugins/crispVoting/utils/describeFailure";
import { votingEscrowAbi } from "../artifacts/votingEscrow";

/**
 * FOLD's lock-aware balance reads.
 *
 * `balanceOf` is NOT what may be locked. FOLD carries vesting/claim locks and blocks any
 * transfer above `transferableBalanceOf` in `_update`, so an escrow `createLock` of an amount
 * the wallet holds but has not yet vested reverts inside the TOKEN — as
 * `InsufficientUnlockedBalance(account, spendable, value)`, selector `0x3f0c4e2d` — long before
 * the escrow gets a say. Bonded FOLD offsets the locked amount, which is why this is a contract
 * read rather than a subtraction the app could do itself.
 */
const foldLockAbi = parseAbi([
  "function transferableBalanceOf(address account) view returns (uint256)",
  "function lockedBalanceOf(address account) view returns (uint256)",
]);

/**
 * Locks FOLD into the voting escrow: an exact-amount approval to the escrow, then
 * `createLock`, which transfers the FOLD in and mints the lock NFT. No unlimited approvals.
 *
 * With a `recipient`, `createLockFor` is used instead: the FOLD still comes from the caller,
 * but the lock NFT — and so the voting power and the eventual withdrawal — belongs to the
 * recipient. The caller keeps no claim on it.
 */
export function useCreateLock(onLocked?: () => void) {
  const { address } = useAccount();
  const client = usePublicClient();
  const [isLocking, setIsLocking] = useState(false);
  // Failures useTransactionManager never sees: the client guard and reverted receipts
  // caught by awaitSuccessfulReceipt. Cleared on account switch — an error belongs to
  // the account that hit it.
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setError(undefined);
  }, [address]);

  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  // What may actually be locked right now. A token without the lock extension (a plain ERC20 on
  // a test deployment) has no such function; the read simply fails and `lockable` falls back to
  // the plain balance, which is the correct answer there.
  const { data: transferableData, refetch: refetchTransferable } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_ADDRESS,
    abi: foldLockAbi,
    functionName: "transferableBalanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  const { data: lockedData, refetch: refetchLocked } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_ADDRESS,
    abi: foldLockAbi,
    functionName: "lockedBalanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  const balance = balanceData as bigint | undefined;
  const transferable = transferableData as bigint | undefined;
  // The cap the lock form must respect. Only ever below `balance`, never above it.
  const lockable = transferable ?? balance;

  // The three reads move together: a lock, a claim, or a bond release changes all of them, and
  // refreshing only the raw balance would leave the form's cap stale.
  const refetchAll = () => {
    void refetchBalance();
    void refetchTransferable();
    void refetchLocked();
  };

  const { writeContractAsync: approveWrite } = useTransactionManager({
    onSuccessMessage: "FOLD approved",
    onErrorMessage: "Could not approve FOLD",
    onError: () => setIsLocking(false),
  });

  // The recipient of the lock currently being created, so the success toast can name who the
  // lock actually belongs to. A ref, not state: it is read inside the transaction manager's
  // callback and must not re-render the form mid-flight.
  const pendingRecipient = useRef<Address | undefined>(undefined);

  const { writeContractAsync: lockWrite } = useTransactionManager({
    onSuccessMessage: "FOLD locked",
    onSuccessDescription: pendingRecipient.current
      ? "The lock is created and belongs to the recipient. Only they can delegate it or withdraw it."
      : "The lock is created. Activate delegation to make it count as voting power.",
    onErrorMessage: "Could not lock FOLD",
    onSuccess: () => {
      setIsLocking(false);
      refetchAll();
      onLocked?.();
    },
    onError: () => setIsLocking(false),
  });

  const createLock = async (amount: bigint, recipient?: Address): Promise<boolean> => {
    if (amount <= 0n) return true;

    setError(undefined);
    setIsLocking(true);
    try {
      if (!client) throw new Error("No RPC client available");
      // Guard here rather than at the contract: `createLockFor` would happily mint to a
      // mistyped address, and the lock is unrecoverable once minted.
      if (recipient !== undefined && !isAddress(recipient)) {
        throw new Error("The recipient address is not a valid address");
      }

      // Refuse locally rather than letting FOLD revert with a bare selector. The approval below
      // succeeds even for locked FOLD — allowance is not a transfer — so without this check the
      // user pays gas for an approval and only then hits `InsufficientUnlockedBalance` on the
      // lock itself. Re-read at submit rather than trusting the render-time value, because
      // vesting advances with the clock and a bond can be released between the two.
      if (address) {
        const spendable = (await client
          .readContract({
            address: PUB_TOKEN_ADDRESS,
            abi: foldLockAbi,
            functionName: "transferableBalanceOf",
            args: [address],
          })
          .catch(() => undefined)) as bigint | undefined;

        if (spendable !== undefined && amount > spendable) {
          throw new Error(
            spendable === 0n
              ? "None of your FOLD has vested yet, so there is nothing available to lock. Vesting FOLD already counts toward your voting power without being locked."
              : `Only part of your FOLD has vested. You can lock up to ${formatUnits(spendable, 18)} FOLD right now; the rest is still vesting.`
          );
        }
      }

      pendingRecipient.current = recipient;

      const approveTx = await approveWrite({
        chainId: PUB_CHAIN.id,
        abi: erc20Abi,
        address: PUB_TOKEN_ADDRESS,
        functionName: "approve",
        args: [PUB_VE_LOCKER_ADDRESS, amount],
      });
      // A reverted approval must stop the flow: the lock that follows would fail anyway.
      await awaitSuccessfulReceipt(client, approveTx, "The FOLD approval");

      const lockTx = await lockWrite({
        chainId: PUB_CHAIN.id,
        abi: votingEscrowAbi,
        address: PUB_VE_LOCKER_ADDRESS,
        ...(recipient === undefined
          ? { functionName: "createLock" as const, args: [amount] as const }
          : { functionName: "createLockFor" as const, args: [amount, recipient] as const }),
      });
      await awaitSuccessfulReceipt(client, lockTx, "The lock");
      return true;
    } catch (err) {
      setError(describeFailure(err, "The lock could not be completed"));
      setIsLocking(false);
      void refetchAll();
      return false;
    }
  };

  return {
    balance,
    /** What may be locked right now — below `balance` whenever FOLD is still vesting. */
    lockable,
    /** FOLD held but not yet vested, so the page can say why the two differ. */
    lockedByVesting: lockedData as bigint | undefined,
    createLock,
    isLocking,
    error,
    refetchBalance: refetchAll,
  };
}
