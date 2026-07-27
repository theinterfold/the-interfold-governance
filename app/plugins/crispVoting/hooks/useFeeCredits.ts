import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { PUB_CHAIN, PUB_CRISP_VOTING_PLUGIN_ADDRESS, PUB_INTERFOLD_FEE_TOKEN_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { iVotesAbi } from "../artifacts/iVotes";

/** Extra margin applied when depositing a fee-credit shortfall (10%). */
export const FEE_BUFFER_PERCENT = 10n;

export function applyFeeBuffer(amount: bigint): bigint {
  return amount + (amount * FEE_BUFFER_PERCENT) / 100n;
}

/**
 * CRISP creator-pays fee escrow: quotes the fee of a proposal created now with the
 * creator-chosen voting window, tracks the connected wallet's credit on the plugin,
 * and exposes deposit/withdraw actions on the escrow.
 *
 * @param chosenDurationSeconds The creator-selected voting window (seconds). The fee is
 *   quoted against `now + chosenDurationSeconds`; the quote is disabled until it is known.
 */
export function useFeeCredits(chosenDurationSeconds?: number) {
  const { address } = useAccount();
  const client = usePublicClient();
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Quote with the creator's chosen window: the sub-proposal's end date is start + duration,
  // and the Interfold fee scales with the input-window length. Quoting (0, 0) would fall back
  // to the plugin's minDuration and under-quote a longer window.
  const quoteEndDate =
    chosenDurationSeconds !== undefined ? BigInt(Math.floor(Date.now() / 1000)) + BigInt(chosenDurationSeconds) : 0n;

  const { data: quoteData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "quoteProposalFee",
    args: [0n, quoteEndDate],
    query: { enabled: chosenDurationSeconds !== undefined },
  });

  const { data: creditData, refetch: refetchCredit } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "feeCredits",
    args: [address!],
    query: { enabled: !!address },
  });

  const { data: decimalsData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
    abi: iVotesAbi,
    functionName: "decimals",
  });

  const quote = quoteData as bigint | undefined;
  const credit = creditData as bigint | undefined;
  // Never defaulted: the fee token is not necessarily 18 (it is 6 on the testnet
  // deployment), so formatting before the read lands would print a wrong figure.
  const decimals = decimalsData === undefined ? undefined : Number(decimalsData);

  const shortfall = quote !== undefined && credit !== undefined && credit < quote ? quote - credit : 0n;

  const { writeContractAsync: approveWrite } = useTransactionManager({
    onSuccessMessage: "Fee token approved",
    onErrorMessage: "Could not approve the fee token",
    onError: () => setIsDepositing(false),
  });

  const { writeContractAsync: depositWrite } = useTransactionManager({
    onSuccessMessage: "Fee credit deposited",
    onErrorMessage: "Could not deposit the fee credit",
    onSuccess: () => {
      setIsDepositing(false);
      refetchCredit();
    },
    onError: () => setIsDepositing(false),
  });

  const { writeContractAsync: withdrawWrite } = useTransactionManager({
    onSuccessMessage: "Fee credit withdrawn",
    onErrorMessage: "Could not withdraw the fee credit",
    onSuccess: () => {
      setIsWithdrawing(false);
      refetchCredit();
    },
    onError: () => setIsWithdrawing(false),
  });

  /**
   * Approves exactly `amount` of the fee token to the plugin and deposits it
   * as credit. No unlimited approvals.
   */
  const deposit = async (amount: bigint): Promise<boolean> => {
    if (amount <= 0n) return true;

    setIsDepositing(true);
    try {
      const approveTx = await approveWrite({
        chainId: PUB_CHAIN.id,
        abi: iVotesAbi,
        address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
        functionName: "approve",
        args: [PUB_CRISP_VOTING_PLUGIN_ADDRESS, amount],
      });
      await client?.waitForTransactionReceipt({ hash: approveTx });

      const depositTx = await depositWrite({
        chainId: PUB_CHAIN.id,
        abi: CrispVotingAbi,
        address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
        functionName: "deposit",
        args: [amount],
      });
      await client?.waitForTransactionReceipt({ hash: depositTx });
      return true;
    } catch (err) {
      console.error("Could not deposit the fee credit", err);
      setIsDepositing(false);
      return false;
    }
  };

  /** Deposits the current shortfall (plus buffer) to cover one proposal. */
  const depositShortfall = () => deposit(applyFeeBuffer(shortfall));

  /** Withdraws unused credit back to the wallet. */
  const withdraw = async (amount?: bigint) => {
    const value = amount ?? credit ?? 0n;
    if (value <= 0n) return;

    setIsWithdrawing(true);
    try {
      const tx = await withdrawWrite({
        chainId: PUB_CHAIN.id,
        abi: CrispVotingAbi,
        address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
        functionName: "withdraw",
        args: [value],
      });
      await client?.waitForTransactionReceipt({ hash: tx });
    } catch (err) {
      console.error("Could not withdraw the fee credit", err);
      setIsWithdrawing(false);
    }
  };

  const format = (value?: bigint) =>
    value === undefined || decimals === undefined ? "—" : formatUnits(value, decimals);

  return {
    quote,
    credit,
    shortfall,
    decimals,
    format,
    deposit,
    depositShortfall,
    withdraw,
    refetchCredit,
    isDepositing,
    isWithdrawing,
  };
}
