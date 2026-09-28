import { PUB_CHAIN } from "@/constants";
import { parseAbi, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";

const votingSourceAbi = parseAbi(["function getVotingToken() view returns (address)"]);
const snapshotAbi = parseAbi([
  "function getPastVotes(address account, uint256 timepoint) view returns (uint256)",
  "function getPastTotalSupply(uint256 timepoint) view returns (uint256)",
]);

/** Display and eligibility must read the same voting source, at the same snapshot. */
export function useSnapshotVotingPower(votingPlugin: Address, timepoint?: bigint, includeTotal = false) {
  const { address } = useAccount();
  const source = useReadContract({
    chainId: PUB_CHAIN.id,
    address: votingPlugin,
    abi: votingSourceAbi,
    functionName: "getVotingToken",
  });
  const yours = useReadContract({
    chainId: PUB_CHAIN.id,
    address: source.data,
    abi: snapshotAbi,
    functionName: "getPastVotes",
    args: [address!, timepoint ?? 0n],
    query: { enabled: !!address && !!source.data && timepoint !== undefined },
  });
  const total = useReadContract({
    chainId: PUB_CHAIN.id,
    address: source.data,
    abi: snapshotAbi,
    functionName: "getPastTotalSupply",
    args: [timepoint ?? 0n],
    query: { enabled: includeTotal && !!source.data && timepoint !== undefined },
  });
  return {
    votingPower: yours.data,
    total: total.data,
    isError: source.isError || yours.isError,
    refetch: yours.refetch,
  };
}
