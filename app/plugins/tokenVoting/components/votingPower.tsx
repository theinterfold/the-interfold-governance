import { useAccount, useReadContract } from "wagmi";
import { formatUnits, parseAbi, type Address } from "viem";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useVotingToken } from "@/hooks/useVotingToken";
import { PUB_CHAIN, PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";

// Single getPastVotes overload to avoid the ambiguous selector in iVotesAbi.
const votesAbi = parseAbi([
  "function getPastVotes(address account, uint256 timepoint) view returns (uint256)",
  "function getPastTotalSupply(uint256 timepoint) view returns (uint256)",
]);

/**
 * Shows the connected account's voting power and the total, both at the proposal's snapshot.
 *
 * Reads the VOTING token named by the plugin, not the raw governance token. A holder's power can
 * live entirely in an escrow position or bonded collateral, where the governance token reports
 * zero votes.
 *
 * @param snapshotTimepoint The proposal's snapshot, in the token's clock units.
 * @param plugin The governance plugin whose voting token applies.
 */
export function VotingPower({ snapshotTimepoint, plugin }: { snapshotTimepoint?: bigint; plugin?: Address }) {
  const { address } = useAccount();
  const votingToken = useVotingToken(plugin);

  const { data: total } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: votingToken,
    abi: votesAbi,
    functionName: "getPastTotalSupply",
    args: [snapshotTimepoint ?? 0n],
    query: { enabled: !!snapshotTimepoint },
  });

  const { data: yours } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: votingToken,
    abi: votesAbi,
    functionName: "getPastVotes",
    args: [address!, snapshotTimepoint ?? 0n],
    query: { enabled: !!address && !!snapshotTimepoint },
  });

  const decimals = useTokenDecimals();
  const fmt = (v?: bigint) =>
    decimals === undefined ? "—" : `${compactNumber(formatUnits(v ?? 0n, decimals))} ${PUB_TOKEN_SYMBOL}`;

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
