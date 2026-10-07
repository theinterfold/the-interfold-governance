import { PUB_CHAIN } from "@/constants";
import { useVotingToken } from "@/hooks/useVotingToken";
import { parseAbi, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";

const snapshotAbi = parseAbi([
  "function getPastVotes(address account, uint256 timepoint) view returns (uint256)",
  "function getPastTotalSupply(uint256 timepoint) view returns (uint256)",
]);

/**
 * The connected wallet's voting power (and optionally the total supply) at a proposal's snapshot.
 * The token comes from `useVotingToken`, so display and eligibility read the same source.
 */
export function useSnapshotVotingPower(votingPlugin: Address, timepoint?: bigint, includeTotal = false) {
  const { address } = useAccount();
  const token = useVotingToken(votingPlugin);
  const yours = useReadContract({
    chainId: PUB_CHAIN.id,
    address: token,
    abi: snapshotAbi,
    functionName: "getPastVotes",
    args: [address!, timepoint ?? 0n],
    query: { enabled: !!address && !!token && timepoint !== undefined },
  });
  const total = useReadContract({
    chainId: PUB_CHAIN.id,
    address: token,
    abi: snapshotAbi,
    functionName: "getPastTotalSupply",
    args: [timepoint ?? 0n],
    query: { enabled: includeTotal && !!token && timepoint !== undefined },
  });
  return {
    votingPower: yours.data,
    total: total.data,
    isError: yours.isError || total.isError,
    refetch: yours.refetch,
  };
}
