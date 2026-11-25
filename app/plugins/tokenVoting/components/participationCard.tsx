import { ParticipationDetails } from "@/components/proposalVoting/participationDetails";
import { useReadContract } from "wagmi";
import { formatUnits, parseAbi } from "viem";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useVotingToken } from "@/hooks/useVotingToken";
import { PUB_CHAIN, PUB_TOKEN_SYMBOL, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
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
  const votingToken = useVotingToken(PUB_TOKEN_VOTING_PLUGIN_ADDRESS);

  const { data: totalSupply } = useReadContract({
    chainId: PUB_CHAIN.id,
    // Quorum is measured against the VOTING token's supply, the same one the tally accrues in.
    address: votingToken,
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
  const fmt = (v: bigint) =>
    decimals === undefined ? "-" : `${compactNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;

  return (
    <ParticipationDetails
      turnout={supply > 0n ? `${turnoutPct.toFixed(2)}%` : undefined}
      voted={fmt(totalVotes)}
      minimum={required === 0n ? "None" : fmt(required)}
      threshold={required > 0n && supply > 0n ? `${requiredPct.toFixed(2)}%` : undefined}
      reached={required > 0n ? reached : undefined}
      total={totalSupply == null ? "—" : fmt(supply)}
    />
  );
}
