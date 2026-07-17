import { useAccount, usePublicClient } from "wagmi";
import { useState } from "react";
import { PUB_CHAIN } from "@/constants";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { iVotesAbi } from "../artifacts/iVotes";
import type { Address } from "viem";

/**
 * Delegates the connected account's voting tokens. ERC20Votes only counts
 * *delegated* balances toward `getVotes`, so a holder must delegate (typically
 * to themselves) before their tokens grant proposal/voting power.
 */
export function useDelegate(votingToken: Address | undefined, onDelegated?: () => void) {
  const { address } = useAccount();
  const client = usePublicClient();
  const [isDelegating, setIsDelegating] = useState(false);

  const { writeContractAsync: delegateWrite } = useTransactionManager({
    onSuccessMessage: "Voting power activated",
    onSuccessDescription: "Your tokens are now delegated and count toward your voting power.",
    onErrorMessage: "Could not delegate voting power",
    onError: () => setIsDelegating(false),
  });

  const selfDelegate = async (delegatee?: Address) => {
    const target = delegatee ?? address;
    if (!votingToken || !target) return;

    try {
      setIsDelegating(true);
      const hash = await delegateWrite({
        chainId: PUB_CHAIN.id,
        abi: iVotesAbi,
        address: votingToken,
        functionName: "delegate",
        args: [target],
      });
      await client?.waitForTransactionReceipt({ hash });
      onDelegated?.();
    } catch (err) {
      console.error("ERR delegate", err);
    } finally {
      setIsDelegating(false);
    }
  };

  return { selfDelegate, isDelegating };
}
