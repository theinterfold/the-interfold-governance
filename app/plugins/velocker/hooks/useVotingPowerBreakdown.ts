import { type Address, isAddress } from "viem";
import { useReadContract } from "wagmi";
import { PUB_BONDED_VOTES_ADDRESS, PUB_CHAIN } from "@/constants";

/** The two BondedVotes reads this hook needs: the checkpoints history and its bonded total. */
const bondedVotesAbi = [
  {
    type: "function",
    name: "checkpoints",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const checkpointsAbi = [
  {
    type: "function",
    name: "bonded",
    stateMutability: "view",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type VotingPowerBreakdown = {
  /** Escrow locks whose power is activated by delegation (the adapter's getVotes). */
  lockedAndDelegated?: bigint;
  /** FOLD bonded as ciphernode collateral (ticket balance + license bond). */
  bonded?: bigint;
  /** Vesting/schedule-locked FOLD counted automatically (the remainder of the total). */
  vesting?: bigint;
  /** True when the breakdown applies (BondedVotes is the voting-power source). */
  available: boolean;
};

/**
 * Splits an account's total voting power into the three halves BondedVotes sums on-chain:
 *
 *   getVotes = adapter.getVotes (locked + delegated)
 *            + checkpoints.bonded (ciphernode collateral)
 *            + lockedVotes (vesting FOLD, capped at the wallet balance)
 *
 * The first two are read directly; vesting is derived as the remainder so the three rows
 * always sum to exactly the total the page displays. Clamped at zero: the total and the
 * components are read in separate calls, so a bond or claim landing between them could
 * otherwise show a negative remainder for one render.
 */
export function useVotingPowerBreakdown(
  address: Address | undefined,
  totalVotes: bigint | undefined,
  lockVotes: bigint | undefined
): VotingPowerBreakdown {
  const available = isAddress(PUB_BONDED_VOTES_ADDRESS);

  const { data: checkpointsAddress } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_BONDED_VOTES_ADDRESS,
    abi: bondedVotesAbi,
    functionName: "checkpoints",
    query: { enabled: available },
  });

  const { data: bonded } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: checkpointsAddress,
    abi: checkpointsAbi,
    functionName: "bonded",
    args: [address!],
    query: { enabled: available && !!address && !!checkpointsAddress },
  });

  if (!available) return { available };

  const vesting =
    totalVotes !== undefined && lockVotes !== undefined && bonded !== undefined
      ? totalVotes > lockVotes + bonded
        ? totalVotes - lockVotes - bonded
        : 0n
      : undefined;

  return { lockedAndDelegated: lockVotes, bonded, vesting, available };
}
