import { useEffect, useRef, useState } from "react";
import { erc20Abi, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS, PUB_VE_LOCKER_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { awaitSuccessfulReceipt } from "@/plugins/crispVoting/utils/awaitReceipt";
import { describeFailure } from "@/plugins/crispVoting/utils/describeFailure";
import { votingEscrowAbi } from "../artifacts/votingEscrow";
import { lockCreationRequest } from "../utils/lockRequest";

/**
 * Locks FOLD into the voting escrow: an exact-amount approval to the escrow, then
 * `createLock` for yourself or `createLockFor` for another owner. No unlimited approvals.
 */
export function useCreateLock(onLocked?: () => void) {
  const { address } = useAccount();
  const connectedAccount = useRef(address);
  connectedAccount.current = address;
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

  const { writeContractAsync: approveWrite } = useTransactionManager({
    onSuccessMessage: "FOLD approved",
    onErrorMessage: "Could not approve FOLD",
    onError: () => setIsLocking(false),
  });

  const { writeContractAsync: lockWrite } = useTransactionManager({
    onSuccessMessage: "FOLD locked",
    onSuccessDescription: "The lock is created for the selected wallet. Its owner controls voting and withdrawals.",
    onErrorMessage: "Could not lock FOLD",
    onSuccess: () => {
      setIsLocking(false);
      void refetchBalance();
      onLocked?.();
    },
    onError: () => setIsLocking(false),
  });

  const createLock = async (amount: bigint, owner?: Address): Promise<boolean> => {
    setError(undefined);
    setIsLocking(true);
    try {
      if (!client) throw new Error("No RPC client available");
      if (!address) throw new Error("Connect your wallet to create a lock.");
      const request = lockCreationRequest(amount, address, owner ?? address);

      const approveTx = await approveWrite({
        account: address,
        chainId: PUB_CHAIN.id,
        abi: erc20Abi,
        address: PUB_TOKEN_ADDRESS,
        functionName: "approve",
        args: [PUB_VE_LOCKER_ADDRESS, amount],
      });
      // A reverted approval must stop the flow: the lock that follows would fail anyway.
      await awaitSuccessfulReceipt(client, approveTx, "The FOLD approval");
      if (connectedAccount.current?.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Your wallet changed. Review the lock again before continuing.");
      }

      const contract = {
        account: address,
        chainId: PUB_CHAIN.id,
        abi: votingEscrowAbi,
        address: PUB_VE_LOCKER_ADDRESS,
      };
      const lockTx = await (request.functionName === "createLock"
        ? lockWrite({ ...contract, ...request })
        : lockWrite({ ...contract, ...request }));
      await awaitSuccessfulReceipt(client, lockTx, "The lock");
      return true;
    } catch (err) {
      setError(describeFailure(err, "The lock could not be completed"));
      setIsLocking(false);
      void refetchBalance();
      return false;
    }
  };

  return {
    balance: balanceData as bigint | undefined,
    createLock,
    isLocking,
    error,
    refetchBalance,
  };
}
