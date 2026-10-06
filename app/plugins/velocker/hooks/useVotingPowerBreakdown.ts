import { type Address, isAddress } from "viem";
import { useReadContract } from "wagmi";
import { PUB_BONDED_VOTES_ADDRESS, PUB_CHAIN } from "@/constants";
import { bondedCheckpointsAbi, bondedVotesAbi } from "@/artifacts/bondedVotes";
import type { BondedDelegation } from "@/hooks/useBondedDelegation";
import { splitVotingPower, type VotingPowerSplit } from "@/utils/bondedDelegation";

export type VotingPowerBreakdown = VotingPowerSplit & {
  /** True when the breakdown applies (BondedVotes is the voting-power source). */
  available: boolean;
  /** The address that votes with the account's own bonded and vesting FOLD, if any. */
  delegate?: Address;
};

/**
 * Splits an account's total voting power into the parts that BondedVotes adds on-chain:
 *
 *   getVotes = adapter.getVotes (locked + delegated)
 *            + checkpoints.bonded + vesting FOLD   unless a bonded delegate represents the account
 *            + the bonded weight of each owner that the account represents
 *
 * The locked, bonded and represented parts are read. Vesting is the remainder, so the rows add
 * up to the total that the page shows. See `splitVotingPower`.
 *
 * @param bonded The account's bonded delegation, from `useBondedDelegation`.
 */
export function useVotingPowerBreakdown(
  address: Address | undefined,
  totalVotes: bigint | undefined,
  lockVotes: bigint | undefined,
  bonded: Pick<BondedDelegation, "delegate" | "representedWeight">
): VotingPowerBreakdown {
  const available = isAddress(PUB_BONDED_VOTES_ADDRESS);

  const { data: checkpointsAddress } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_BONDED_VOTES_ADDRESS,
    abi: bondedVotesAbi,
    functionName: "checkpoints",
    query: { enabled: available },
  });

  const { data: bondedFold } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: checkpointsAddress,
    abi: bondedCheckpointsAbi,
    functionName: "bonded",
    args: [address!],
    query: { enabled: available && !!address && !!checkpointsAddress },
  });

  if (!available) return { available };

  return {
    ...splitVotingPower({
      total: totalVotes,
      lockVotes,
      bonded: bondedFold,
      represented: bonded.representedWeight,
      delegatedAway: !!bonded.delegate,
    }),
    available,
    delegate: bonded.delegate,
  };
}
