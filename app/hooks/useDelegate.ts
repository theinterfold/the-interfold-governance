import { useAccount } from "wagmi";
import type { Address } from "viem";
import { iVotesAbi } from "@/plugins/crispVoting/artifacts/iVotes";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";

/** Delegate the connected account's FOLD voting power to a target (or to self). */
export function useDelegate(onSuccess?: () => void) {
  const { address } = useAccount();

  const { writeContract, isConfirming, isConfirmed } = useTransactionManager({
    onSuccessMessage: "Voting power delegated",
    onSuccess,
    onErrorMessage: "Could not delegate voting power",
  });

  const delegate = (target: Address) => {
    writeContract({
      chainId: PUB_CHAIN.id,
      abi: iVotesAbi,
      address: PUB_TOKEN_ADDRESS,
      functionName: "delegate",
      args: [target],
    });
  };

  const delegateToSelf = () => {
    if (address) delegate(address);
  };

  return { delegate, delegateToSelf, isConfirming, isConfirmed, canDelegate: !!address };
}
