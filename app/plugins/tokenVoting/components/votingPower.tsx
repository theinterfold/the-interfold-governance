import { useAccount, useReadContract } from "wagmi";
import { formatEther, parseAbi } from "viem";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS, PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";

// Single getPastVotes overload to avoid the ambiguous selector in iVotesAbi.
const votesAbi = parseAbi([
  "function getPastVotes(address account, uint256 timepoint) view returns (uint256)",
  "function getPastTotalSupply(uint256 timepoint) view returns (uint256)",
]);

/** Shows the connected account's voting power and the total, both at the proposal's snapshot. */
export function VotingPower({ snapshotTimepoint }: { snapshotTimepoint?: bigint }) {
  const { address } = useAccount();

  const { data: total } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_ADDRESS,
    abi: votesAbi,
    functionName: "getPastTotalSupply",
    args: [snapshotTimepoint ?? 0n],
    query: { enabled: !!snapshotTimepoint },
  });

  const { data: yours } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_ADDRESS,
    abi: votesAbi,
    functionName: "getPastVotes",
    args: [address!, snapshotTimepoint ?? 0n],
    query: { enabled: !!address && !!snapshotTimepoint },
  });

  const fmt = (v?: bigint) => `${compactNumber(formatEther(v ?? 0n))} ${PUB_TOKEN_SYMBOL}`;

  return (
    <div className="flex flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-4 xl:p-6">
      <p className="text-sm font-semibold text-neutral-800">Voting power</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">Yours{address ? " (at snapshot)" : ""}</span>
        <span className="font-semibold text-neutral-800">{address ? fmt(yours as bigint | undefined) : "—"}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">Total</span>
        <span className="font-semibold text-neutral-800">{fmt(total as bigint | undefined)}</span>
      </div>
    </div>
  );
}
