import { useEffect, useState } from "react";
import { type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { PUB_CHAIN, PUB_VE_LOCKER_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { awaitSuccessfulReceipt } from "@/plugins/crispVoting/utils/awaitReceipt";
import { describeFailure } from "@/plugins/crispVoting/utils/describeFailure";
import { votingEscrowAbi } from "../artifacts/votingEscrow";
import { lockNftAbi } from "../artifacts/lockNft";

/**
 * The two-phase exit. `beginWithdrawal` needs the escrow approved on the lock NFT first
 * (the escrow pulls it via transferFrom and the Lock contract does not auto-approve it), so
 * that step is an approve + begin pair; the approval is skipped when already granted.
 * Voting power stops the moment the withdrawal begins; the FOLD returns via `withdraw`
 * once the exit queue's cooldown has passed.
 */
export function useVeWithdraw(lockNft: Address | undefined, onChanged?: () => void) {
  const { address } = useAccount();
  const client = usePublicClient();
  const [pendingTokenId, setPendingTokenId] = useState<bigint | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setError(undefined);
  }, [address]);

  const done = () => {
    setPendingTokenId(undefined);
    onChanged?.();
  };

  const { writeContractAsync: approveWrite } = useTransactionManager({
    onSuccessMessage: "Lock NFT approved",
    onErrorMessage: "Could not approve the lock NFT",
    onError: () => setPendingTokenId(undefined),
  });
  const { writeContractAsync: beginWrite } = useTransactionManager({
    onSuccessMessage: "Withdrawal started",
    onSuccessDescription: "The lock stopped counting as voting power. Withdraw once the cooldown ends.",
    onErrorMessage: "Could not start the withdrawal",
    onSuccess: done,
    onError: () => setPendingTokenId(undefined),
  });
  const { writeContractAsync: withdrawWrite } = useTransactionManager({
    onSuccessMessage: "FOLD withdrawn",
    onErrorMessage: "Could not withdraw",
    onSuccess: done,
    onError: () => setPendingTokenId(undefined),
  });
  const { writeContractAsync: cancelWrite } = useTransactionManager({
    onSuccessMessage: "Withdrawal cancelled",
    onSuccessDescription: "The lock is active again. Re-delegate if it was delegated before.",
    onErrorMessage: "Could not cancel the withdrawal",
    onSuccess: done,
    onError: () => setPendingTokenId(undefined),
  });

  const beginWithdrawal = async (tokenId: bigint) => {
    setError(undefined);
    setPendingTokenId(tokenId);
    try {
      if (!client) throw new Error("No RPC client available");
      if (!lockNft) throw new Error("Lock NFT not resolved yet");

      const approved = (await client.readContract({
        address: lockNft,
        abi: lockNftAbi,
        functionName: "getApproved",
        args: [tokenId],
      })) as Address;

      if (approved.toLowerCase() !== PUB_VE_LOCKER_ADDRESS.toLowerCase()) {
        const approveTx = await approveWrite({
          chainId: PUB_CHAIN.id,
          abi: lockNftAbi,
          address: lockNft,
          functionName: "approve",
          args: [PUB_VE_LOCKER_ADDRESS, tokenId],
        });
        await awaitSuccessfulReceipt(client, approveTx, "The lock NFT approval");
      }

      const beginTx = await beginWrite({
        chainId: PUB_CHAIN.id,
        abi: votingEscrowAbi,
        address: PUB_VE_LOCKER_ADDRESS,
        functionName: "beginWithdrawal",
        args: [tokenId],
      });
      await awaitSuccessfulReceipt(client, beginTx, "The withdrawal request");
    } catch (err) {
      setError(describeFailure(err, "The withdrawal could not be started"));
      setPendingTokenId(undefined);
    }
  };

  const withdraw = async (tokenId: bigint) => {
    setError(undefined);
    setPendingTokenId(tokenId);
    try {
      if (!client) throw new Error("No RPC client available");
      const tx = await withdrawWrite({
        chainId: PUB_CHAIN.id,
        abi: votingEscrowAbi,
        address: PUB_VE_LOCKER_ADDRESS,
        functionName: "withdraw",
        args: [tokenId],
      });
      await awaitSuccessfulReceipt(client, tx, "The withdrawal");
    } catch (err) {
      setError(describeFailure(err, "The withdrawal could not be completed"));
      setPendingTokenId(undefined);
    }
  };

  const cancelWithdrawal = async (tokenId: bigint) => {
    setError(undefined);
    setPendingTokenId(tokenId);
    try {
      if (!client) throw new Error("No RPC client available");
      const tx = await cancelWrite({
        chainId: PUB_CHAIN.id,
        abi: votingEscrowAbi,
        address: PUB_VE_LOCKER_ADDRESS,
        functionName: "cancelWithdrawalRequest",
        args: [tokenId],
      });
      await awaitSuccessfulReceipt(client, tx, "The cancellation");
    } catch (err) {
      setError(describeFailure(err, "The cancellation could not be completed"));
      setPendingTokenId(undefined);
    }
  };

  return {
    beginWithdrawal,
    withdraw,
    cancelWithdrawal,
    /** The tokenId with an action in flight, if any — for per-row button spinners. */
    pendingTokenId,
    error,
  };
}
