import { useAccount } from "wagmi";
import type { Address } from "viem";
import { iVotesAbi } from "@/plugins/crispVoting/artifacts/iVotes";
import { PUB_CHAIN, PUB_ENABLE_LOCKING, PUB_TOKEN_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { useVeEscrow } from "@/plugins/velocker/hooks/useVeEscrow";

/**
 * Delegate the connected account's voting power to a target (or to self).
 *
 * With the velocker enabled, delegation lives on the escrow's IVotes ADAPTER — locks are what
 * carry voting power, and the raw token's own delegation feeds a read nothing consumes. Both
 * contracts expose the same `delegate(address)` surface, so only the target differs. The
 * adapter address is read off the escrow on-chain, hence `canDelegate` waits for it.
 */
export function useDelegate(onSuccess?: () => void) {
  const { address } = useAccount();
  const { adapter } = useVeEscrow();
  const delegationTarget = PUB_ENABLE_LOCKING ? adapter : PUB_TOKEN_ADDRESS;

  const { writeContract, isConfirming, isConfirmed } = useTransactionManager({
    onSuccessMessage: "Voting power delegated",
    onSuccess,
    onErrorMessage: "Could not delegate voting power",
  });

  const delegate = (target: Address) => {
    if (!delegationTarget) return;
    writeContract({
      chainId: PUB_CHAIN.id,
      abi: iVotesAbi,
      address: delegationTarget,
      functionName: "delegate",
      args: [target],
    });
  };

  const delegateToSelf = () => {
    if (address) delegate(address);
  };

  return { delegate, delegateToSelf, isConfirming, isConfirmed, canDelegate: !!address && !!delegationTarget };
}
