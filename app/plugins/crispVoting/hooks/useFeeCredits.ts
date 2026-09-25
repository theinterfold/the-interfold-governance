import { useEffect, useState } from "react";
import { erc20Abi, formatUnits } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { PUB_CHAIN, PUB_CRISP_VOTING_PLUGIN_ADDRESS, PUB_INTERFOLD_FEE_TOKEN_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { iVotesAbi } from "../artifacts/iVotes";
import { awaitSuccessfulReceipt } from "../utils/awaitReceipt";
import { describeFailure } from "../utils/describeFailure";

/** Extra margin applied when depositing a fee-credit shortfall (10%). */
const FEE_BUFFER_PERCENT = 10n;

/**
 * CRISP creator-pays fee escrow: quotes the fee for the stage-configured voting duration,
 * tracks the connected wallet's credit on the plugin, and exposes deposit/withdraw actions.
 *
 * @param chosenDurationSeconds The stage-configured voting duration in seconds.
 */
export function useFeeCredits(chosenDurationSeconds?: number) {
  const { address } = useAccount();
  const client = usePublicClient();
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  // Both actions can fail where `useTransactionManager` never sees it — the client guard fires
  // before any transaction is sent, and a reverted receipt is caught by `awaitSuccessfulReceipt`
  // rather than by wagmi. Callers discard these promises, so an uncaught throw is an unhandled
  // rejection and a button that silently does nothing.
  const [error, setError] = useState<string | undefined>(undefined);

  // An error belongs to the account that hit it. Switching wallets otherwise carries the previous
  // account's failure over and shows it against balances it has nothing to do with.
  useEffect(() => {
    setError(undefined);
  }, [address]);

  const { data: quoteData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "quoteProposalFeeForDuration",
    args: [BigInt(chosenDurationSeconds ?? 0)],
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

  // `deposit` pulls the amount with `transferFrom`, so a wallet holding less than it reverts inside
  // the token (`usds/insufficient-balance` on mainnet) — after the approval has already cost gas.
  // Reading the balance lets the UI refuse the deposit instead of sending it.
  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  const { data: decimalsData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
    abi: iVotesAbi,
    functionName: "decimals",
  });

  const { data: symbolData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "symbol",
  });

  const quote = quoteData as bigint | undefined;
  const credit = creditData as bigint | undefined;
  const walletBalance = balanceData as bigint | undefined;
  const symbol = symbolData as string | undefined;
  // Never defaulted: the fee token is not necessarily 18 (it is 6 on the testnet
  // deployment), so formatting before the read lands would print a wrong figure.
  const decimals = decimalsData === undefined ? undefined : Number(decimalsData);

  const shortfall = quote !== undefined && credit !== undefined && credit < quote ? quote - credit : 0n;
  /** What covering one proposal deposits: the shortfall plus the buffer. */
  const depositNeeded = shortfall + (shortfall * FEE_BUFFER_PERCENT) / 100n;

  const format = (value?: bigint) =>
    value === undefined || decimals === undefined ? "—" : formatUnits(value, decimals);
  const unit = symbol ?? "fee token";
  const insufficientBalanceMessage = (needed: bigint, held: bigint) =>
    `Insufficient ${unit} balance: the deposit needs ${format(needed)} ${unit}, but your wallet holds ${format(held)} ${unit}.`;
  /** Why the wallet cannot fund `depositNeeded`; undefined when it can, or while either value is loading. */
  const balanceShortfall =
    walletBalance !== undefined && depositNeeded > walletBalance
      ? insufficientBalanceMessage(depositNeeded, walletBalance)
      : undefined;

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
      refetchBalance();
    },
    onError: () => setIsDepositing(false),
  });

  const { writeContractAsync: withdrawWrite } = useTransactionManager({
    onSuccessMessage: "Fee credit withdrawn",
    onErrorMessage: "Could not withdraw the fee credit",
    onSuccess: () => {
      setIsWithdrawing(false);
      refetchCredit();
      refetchBalance();
    },
    onError: () => setIsWithdrawing(false),
  });

  /**
   * Approves exactly `amount` of the fee token to the plugin and deposits it
   * as credit. No unlimited approvals.
   */
  const deposit = async (amount: bigint): Promise<boolean> => {
    if (amount <= 0n) return true;

    setError(undefined);
    setIsDepositing(true);
    try {
      // Optional chaining on `client` would make every await below resolve to `undefined` rather
      // than fail, silently skipping the receipt waits — the UI would report success and refetch
      // stale balances while the transactions were still pending.
      if (!client) throw new Error("No RPC client available");
      if (!address) throw new Error("Connect a wallet to deposit");

      // Read fresh rather than trusting the watched value: it can lag a transfer out, and this
      // check is what keeps an unfundable deposit from costing the user an approval first.
      const held = await client.readContract({
        address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      if (held < amount) throw new Error(insufficientBalanceMessage(amount, held));

      const approveTx = await approveWrite({
        chainId: PUB_CHAIN.id,
        abi: iVotesAbi,
        address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
        functionName: "approve",
        args: [PUB_CRISP_VOTING_PLUGIN_ADDRESS, amount],
      });
      // A reverted approval must stop the flow: the deposit that follows would fail anyway.
      await awaitSuccessfulReceipt(client, approveTx, "The fee-token approval");

      const depositTx = await depositWrite({
        chainId: PUB_CHAIN.id,
        abi: CrispVotingAbi,
        address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
        functionName: "deposit",
        args: [amount],
      });
      await awaitSuccessfulReceipt(client, depositTx, "The deposit");
      return true;
    } catch (err) {
      setError(describeFailure(err, "The deposit could not be completed"));
      setIsDepositing(false);
      void refetchCredit();
      void refetchBalance();
      return false;
    }
  };

  /** Deposits the current shortfall (plus buffer) to cover one proposal. */
  const depositShortfall = () => deposit(depositNeeded);

  /** Withdraws unused credit back to the wallet. */
  const withdraw = async (amount?: bigint) => {
    const value = amount ?? credit ?? 0n;
    if (value <= 0n) return;

    setError(undefined);
    setIsWithdrawing(true);
    try {
      if (!client) throw new Error("No RPC client available");

      const tx = await withdrawWrite({
        chainId: PUB_CHAIN.id,
        abi: CrispVotingAbi,
        address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
        functionName: "withdraw",
        args: [value],
      });
      await awaitSuccessfulReceipt(client, tx, "The withdrawal");
    } catch (err) {
      setError(describeFailure(err, "The withdrawal could not be completed"));
      setIsWithdrawing(false);
      void refetchCredit();
      void refetchBalance();
    }
  };

  return {
    quote,
    credit,
    shortfall,
    depositNeeded,
    walletBalance,
    /** Why the wallet cannot fund `depositNeeded`; undefined when it can, or while either value loads. */
    balanceShortfall,
    decimals,
    symbol,
    /** Why the last deposit or withdrawal failed, if it did. */
    error,
    format,
    deposit,
    depositShortfall,
    withdraw,
    refetchCredit,
    isDepositing,
    isWithdrawing,
  };
}
