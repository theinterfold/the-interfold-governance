import { useAccount } from "wagmi";
import { iVotesAbi } from "@/plugins/crispVoting/artifacts/iVotes";
import { PUB_CHAIN, PUB_ENABLE_LOCKING, PUB_TOKEN_ADDRESS } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { useVeEscrow } from "@/plugins/velocker/hooks/useVeEscrow";

/**
 * Delegate the connected account's voting power to the account itself.
 *
 * With the velocker enabled, delegation lives on the escrow's IVotes ADAPTER. Locks carry voting
 * power, and the raw token's own delegation feeds a read nothing consumes. Without it, delegation
 * lives on the token. The adapter address is read off the escrow on-chain, so `canDelegate` waits
 * for it. An account that delegated to another address takes its voting power back the same way.
 */
export function useDelegate(onSuccess?: () => void) {
  const { address } = useAccount();
  const { adapter } = useVeEscrow();
  const delegationTarget = PUB_ENABLE_LOCKING ? adapter : PUB_TOKEN_ADDRESS;

  const { writeContract, isConfirming, isConfirmed } = useTransactionManager({
    onSuccessMessage: "Voting power activated",
    onSuccess,
    onErrorMessage: "Could not activate voting power",
  });

  const delegateToSelf = () => {
    if (!address || !delegationTarget) return;
    writeContract({
      chainId: PUB_CHAIN.id,
      abi: iVotesAbi,
      address: delegationTarget,
      functionName: "delegate",
      args: [address],
    });
  };

  return { delegateToSelf, isConfirming, isConfirmed, canDelegate: !!address && !!delegationTarget };
}
