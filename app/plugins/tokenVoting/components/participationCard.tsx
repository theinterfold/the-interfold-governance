import { useReadContract } from "wagmi";
import { formatUnits, parseAbi } from "viem";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS, PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";

import type { Proposal } from "../utils/types";

const votesAbi = parseAbi(["function getPastTotalSupply(uint256 timepoint) view returns (uint256)"]);

/**
 * Participation (quorum) panel for a TokenVoting proposal: turnout vs. the
 * required minimum (`parameters.minVotingPower`, an absolute voting power the
 * contract derived from minParticipation at creation) against the total voting
 * power at the snapshot.
 */
export function ParticipationCard({ proposal }: { proposal: Proposal }) {
  const snapshotTimepoint = proposal.parameters.snapshotTimepoint;
  const decimals = useTokenDecimals();

  const { data: totalSupply } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_ADDRESS,
    abi: votesAbi,
    functionName: "getPastTotalSupply",
    args: [snapshotTimepoint ?? 0n],
    query: { enabled: !!snapshotTimepoint },
  });

  const totalVotes = proposal.tally.yes + proposal.tally.no + proposal.tally.abstain;
  const required = proposal.parameters.minVotingPower;
  const reached = totalVotes >= required;

  const supply = (totalSupply as bigint | undefined) ?? 0n;
  const pct = (part: bigint) => (supply > 0n ? (Number(part) / Number(supply)) * 100 : 0);
  const turnoutPct = pct(totalVotes);
  const requiredPct = pct(required);
  const progressPct = required > 0n ? Math.min((Number(totalVotes) / Number(required)) * 100, 100) : 100;

  const fmt = (v: bigint) =>
    decimals === undefined ? "—" : `${compactNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;

  return (
    <div className="flex flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-4 xl:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-800">Participation {reached ? "✓" : ""}</p>
        <span className="text-sm text-neutral-500">
          {turnoutPct.toFixed(2)}% / {requiredPct.toFixed(2)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full"
          style={{
            width: `${progressPct}%`,
            background: reached ? "var(--accent, #2f8a4f)" : "var(--muted-ink, #9a9a9a)",
          }}
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">Voted</span>
        <span className="font-semibold text-neutral-800">{fmt(totalVotes)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">Required minimum</span>
        <span className="font-semibold text-neutral-800">{fmt(required)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">Total voting power</span>
        <span className="font-semibold text-neutral-800">{fmt(supply)}</span>
      </div>
    </div>
  );
}
