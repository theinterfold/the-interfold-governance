import { erc20Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { PUB_CHAIN, PUB_FAUCET_ADDRESS } from "@/constants";
import { faucetAbi } from "@/artifacts/faucet";
import { useTransactionManager } from "./useTransactionManager";

import type { Address } from "viem";

/**
 * Testnet faucet claim, mirroring the contract's own gate so the UI can explain
 * itself before spending a transaction.
 *
 * `Faucet.faucet()` tops up each token independently when the caller holds less
 * than `AMOUNT_FOLD` / `AMOUNT_FEE_TOKEN`, and reverts with "You have enough
 * tokens" when neither is below its threshold. Both the amounts and the token
 * addresses are read off the faucet rather than assumed, so the check can't
 * drift from what the contract actually dispenses (the fee token is 6 decimals,
 * FOLD is 18 — nothing here hardcodes either).
 */
export function useFaucet() {
  const { address } = useAccount();
  const enabled = !!PUB_FAUCET_ADDRESS;

  const faucetContract = { chainId: PUB_CHAIN.id, address: PUB_FAUCET_ADDRESS, abi: faucetAbi } as const;

  const { data: config } = useReadContracts({
    contracts: [
      { ...faucetContract, functionName: "fold" },
      { ...faucetContract, functionName: "feeToken" },
      { ...faucetContract, functionName: "AMOUNT_FOLD" },
      { ...faucetContract, functionName: "AMOUNT_FEE_TOKEN" },
    ],
    query: { enabled, staleTime: Infinity },
  });

  const foldToken = config?.[0]?.result as Address | undefined;
  const feeToken = config?.[1]?.result as Address | undefined;
  const amountFold = config?.[2]?.result as bigint | undefined;
  const amountFee = config?.[3]?.result as bigint | undefined;

  const balancesEnabled = enabled && !!address && !!foldToken && !!feeToken;

  const { data: balances, refetch: refetchBalances } = useReadContracts({
    contracts: [
      { chainId: PUB_CHAIN.id, address: foldToken!, abi: erc20Abi, functionName: "balanceOf", args: [address!] },
      { chainId: PUB_CHAIN.id, address: feeToken!, abi: erc20Abi, functionName: "balanceOf", args: [address!] },
      {
        chainId: PUB_CHAIN.id,
        address: foldToken!,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [PUB_FAUCET_ADDRESS],
      },
      {
        chainId: PUB_CHAIN.id,
        address: feeToken!,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [PUB_FAUCET_ADDRESS],
      },
    ],
    query: { enabled: balancesEnabled },
  });

  const yourFold = balances?.[0]?.result as bigint | undefined;
  const yourFee = balances?.[1]?.result as bigint | undefined;
  const heldFold = balances?.[2]?.result as bigint | undefined;
  const heldFee = balances?.[3]?.result as bigint | undefined;

  const { writeContract, isConfirming } = useTransactionManager({
    onSuccessMessage: "Test tokens sent",
    onErrorMessage: "Could not claim from the faucet",
    onSuccess: () => refetchBalances(),
  });

  const ready =
    amountFold !== undefined &&
    amountFee !== undefined &&
    yourFold !== undefined &&
    yourFee !== undefined &&
    heldFold !== undefined &&
    heldFee !== undefined;

  // Mirrors Faucet.faucet() exactly: per-token top-up, then a per-token funding check.
  const needsFold = ready && yourFold < amountFold;
  const needsFee = ready && yourFee < amountFee;
  const wouldRevertDry = ready && ((needsFold && heldFold < amountFold) || (needsFee && heldFee < amountFee));

  let blockedReason: string | undefined;
  if (!address) blockedReason = "Connect your wallet to claim test tokens";
  else if (!ready) blockedReason = undefined;
  else if (!needsFold && !needsFee) blockedReason = "You already have enough test tokens";
  else if (wouldRevertDry) blockedReason = "The faucet is out of funds";

  const canClaim = !!address && ready && (needsFold || needsFee) && !wouldRevertDry;

  const claim = () => {
    writeContract({ chainId: PUB_CHAIN.id, abi: faucetAbi, address: PUB_FAUCET_ADDRESS, functionName: "faucet" });
  };

  return { claim, canClaim, blockedReason, isConfirming, needsFold, needsFee, isReady: ready };
}
