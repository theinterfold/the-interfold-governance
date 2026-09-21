import { PUB_VOTING_POWER_SOURCE } from "@/constants";
import { useReadContract } from "wagmi";
import { parseAbi } from "viem";

const erc20Votes = parseAbi(["function getPastTotalSupply(uint256 blockNumber) view returns (uint256)"]);

export function usePastSupply(snapshotBlock: bigint | undefined) {
  const { data: pastSupply } = useReadContract({
    // Quorum is a fraction of the VOTING token's supply (BondedVotes), which is what the plugin
    // and the server both measure. Reading the raw governance token here would size quorum
    // against a different supply than the votes are counted from.
    address: PUB_VOTING_POWER_SOURCE,
    abi: erc20Votes,
    functionName: "getPastTotalSupply",
    args: [BigInt(snapshotBlock ?? 0)],
  });

  return pastSupply ?? BigInt(0);
}
