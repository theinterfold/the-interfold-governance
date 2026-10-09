import { useEffect, useState } from "react";
import { erc20Abi, formatUnits } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { PUB_CHAIN, PUB_INTERFOLD_FEE_TOKEN_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { iVotesAbi } from "../artifacts/iVotes";
import { awaitSuccessfulReceipt } from "../utils/awaitReceipt";
import { describeFailure } from "../utils/describeFailure";
import { usePrivatePair } from "./usePrivatePair";

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
  const { body } = usePrivatePair();
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

  const {
    data: quoteData,
    error: quoteError,
    refetch: refetchQuote,
  } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: body,
    abi: CrispVotingAbi,
    functionName: "quoteProposalFeeForDuration",
    args: [BigInt(chosenDurationSeconds ?? 0)],
    query: { enabled: chosenDurationSeconds !== undefined },
  });

  const {
    data: creditData,
    error: creditError,
    refetch: refetchCredit,
  } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: body,
    abi: CrispVotingAbi,
    functionName: "feeCredits",
    args: [address!],
    query: { enabled: !!address },
  });

  // `deposit` pulls the amount with `transferFrom`, so a wallet holding less than it reverts inside
  // the token (`usds/insufficient-balance` on mainnet) — after the approval has already cost gas.
  // Reading the balance lets the UI refuse the deposit instead of sending it.
  const {
    data: balanceData,
    error: balanceError,
    refetch: refetchBalance,
  } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  const {
    data: decimalsData,
    error: decimalsError,
    refetch: refetchDecimals,
  } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
    abi: iVotesAbi,
    functionName: "decimals",
  });

  const {
    data: symbolData,
    error: symbolError,
    refetch: refetchSymbol,
  } = useReadContract({
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

  const readError = quoteError ?? creditError ?? balanceError ?? decimalsError ?? symbolError;
  const shortfall =
    readError || quote === undefined || credit === undefined ? undefined : credit < quote ? quote - credit : 0n;
  /** What covering one proposal deposits: the shortfall plus the buffer. */
  const depositNeeded = shortfall === undefined ? 0n : shortfall + (shortfall * FEE_BUFFER_PERCENT) / 100n;

  const format = (value?: bigint) =>
    value === undefined || decimals === undefined ? "-" : formatUnits(value, decimals);
  const unit = symbol ?? "fee token";
  const insufficientBalanceMessage = (needed: bigint, held: bigint) =>
    `Insufficient ${unit} balance: the deposit needs ${format(needed)} ${unit}, but your wallet holds ${format(held)} ${unit}.`;
  /** Why the wallet cannot fund `depositNeeded`; undefined when it can, or while either value is loading. */
  const balanceShortfall =
    !readError && walletBalance !== undefined && depositNeeded > walletBalance
      ? insufficientBalanceMessage(depositNeeded, walletBalance)
      : undefined;
  const retryReads = async () => {
    await Promise.all([
      chosenDurationSeconds === undefined ? Promise.resolve() : refetchQuote(),
      address ? refetchCredit() : Promise.resolve(),
      address ? refetchBalance() : Promise.resolve(),
      refetchDecimals(),
      refetchSymbol(),
    ]);
  };

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
   * Deposits `amount` of the fee token as credit. It first approves exactly `amount` to the
   * plugin, unless the plugin can already spend that much. No unlimited approvals.
   */
  const deposit = async (amount: bigint): Promise<boolean> => {
    if (
      readError ||
      !address ||
      quote === undefined ||
      credit === undefined ||
      balanceData === undefined ||
      decimals === undefined
    )
      return false;
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

      // An approval can outlive its deposit, for example when the wallet rejected the deposit or
      // it reverted. Read the allowance fresh and ask for a new approval only when it is short.
      const allowance = await client.readContract({
        address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, body],
      });
      if (allowance < amount) {
        const approveTx = await approveWrite({
          chainId: PUB_CHAIN.id,
          abi: iVotesAbi,
          address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
          functionName: "approve",
          args: [body, amount],
        });
        // A reverted approval must stop the flow: the deposit that follows would fail anyway.
        await awaitSuccessfulReceipt(client, approveTx, "The fee-token approval");
      }

      const depositTx = await depositWrite({
        chainId: PUB_CHAIN.id,
        abi: CrispVotingAbi,
        address: body,
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
  const depositShortfall = () =>
    readError || shortfall === undefined ? Promise.resolve(false) : deposit(depositNeeded);

  /** Withdraws unused credit back to the wallet. */
  const withdraw = async (amount?: bigint) => {
    if (readError || !address || credit === undefined) return;
    const value = amount ?? credit ?? 0n;
    if (value <= 0n) return;

    setError(undefined);
    setIsWithdrawing(true);
    try {
      if (!client) throw new Error("No RPC client available");

      const tx = await withdrawWrite({
        chainId: PUB_CHAIN.id,
        abi: CrispVotingAbi,
        address: body,
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
    quote: readError ? undefined : quote,
    credit: readError ? undefined : credit,
    walletBalance: readError ? undefined : walletBalance,
    shortfall,
    depositNeeded,
    /** Why the wallet cannot fund `depositNeeded`; undefined when it can, or while either value loads. */
    balanceShortfall,
    readError,
    retryReads,
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
