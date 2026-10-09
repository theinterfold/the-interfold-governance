import { usePrivatePair } from "./usePrivatePair";
import { useVotingToken } from "@/hooks/useVotingToken";
import { useReadContract } from "wagmi";
import { parseAbi } from "viem";

const erc20Votes = parseAbi(["function getPastTotalSupply(uint256 blockNumber) view returns (uint256)"]);

export function usePastSupply(snapshotBlock: bigint | undefined) {
  // Quorum is a fraction of the VOTING token's supply, which is what the plugin and the server
  // both measure. Asked of the plugin rather than read from env, so a deployment whose voting
  // token differs from the configured one cannot size quorum against the wrong supply.
  const { body } = usePrivatePair();
  const votingToken = useVotingToken(body);

  const { data: pastSupply } = useReadContract({
    address: votingToken,
    abi: erc20Votes,
    functionName: "getPastTotalSupply",
    args: [BigInt(snapshotBlock ?? 0)],
  });

  return pastSupply ?? BigInt(0);
}
