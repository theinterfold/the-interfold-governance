import { useRef, useState } from "react";
import { formatUnits } from "viem";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";
import { usePastSupply } from "../hooks/usePastSupply";
import { useToken } from "../hooks/useToken";
import { useVotingPowerDivisor } from "../hooks/useVotingPowerDivisor";
import { computeQuorum, tallyCountToTokens } from "../utils/quorum";
import { EligibleVotersDialog } from "./eligibleVotersDialog";
import { ParticipationDetails } from "@/components/proposalVoting/participationDetails";

import type { Proposal } from "../utils/types";

/**
 * Participation (quorum) panel for a CRISP proposal — the private twin of the
 * TokenVoting ParticipationCard. Turnout is the tally sum converted back to raw token units with
 * the divisor CRISP recorded for the round, compared against minParticipation% of the total
 * voting power at the snapshot. Before the tally lands, votes are encrypted and turnout is
 * unknowable.
 */
export function ParticipationCard({ proposal }: { proposal: Proposal }) {
  const pastSupply = usePastSupply(proposal.parameters.snapshotBlock);
  const { decimals } = useToken();
  const divisor = useVotingPowerDivisor(proposal.e3Id);
  const [showVoters, setShowVoters] = useState(false);
  const votersTriggerRef = useRef<HTMLButtonElement>(null);

  const creditMode = proposal.parameters.creditMode;
  const tokenDecimals = decimals === undefined ? undefined : Number(decimals);

  const minParticipation = Number(proposal.parameters.minParticipation ?? 0n);
  const totalVotes = (proposal.tally ?? []).reduce((sum, vote) => sum + (vote ?? 0n), 0n);
  const quorum = proposal.isTallied ? computeQuorum(totalVotes, pastSupply, minParticipation, creditMode, divisor) : null;
  const required = (pastSupply * BigInt(minParticipation) + 99n) / 100n;
  const fmt = (value: bigint) => tokenDecimals === undefined ? "—" : `${compactNumber(formatUnits(value, tokenDecimals))} ${PUB_TOKEN_SYMBOL}`;
  const votedTokens = tokenDecimals === undefined ? undefined : tallyCountToTokens(totalVotes, creditMode, tokenDecimals, divisor);

  return (
    <ParticipationDetails
      turnout={quorum ? `${quorum.turnoutPct.toFixed(2)}%` : undefined}
      voted={proposal.isTallied && votedTokens != null ? `${compactNumber(votedTokens.toString())} ${PUB_TOKEN_SYMBOL}` : undefined}
      minimum={minParticipation === 0 ? "None" : pastSupply > 0n ? fmt(required) : "—"}
      threshold={minParticipation > 0 ? `${minParticipation}%` : undefined}
      reached={minParticipation > 0 ? quorum?.reached : undefined}
      total={pastSupply > 0n ? fmt(pastSupply) : "—"}
      encrypted={!proposal.isTallied}
    >
      {/* Anyone can audit who was eligible and with what weight — the dialog re-derives
          each entry from the token at the snapshot rather than trusting the server. */}
      <button
        ref={votersTriggerRef}
        type="button"
        className="mt-1 text-left text-sm text-primary-400 hover:underline"
        onClick={() => setShowVoters(true)}
      >
        View eligible voters ↗
      </button>

      <EligibleVotersDialog
        triggerRef={votersTriggerRef}
        open={showVoters}
        onClose={() => setShowVoters(false)}
        e3Id={proposal.e3Id}
        chainSnapshot={proposal.parameters.snapshotBlock}
      />
    </ParticipationDetails>
  );
}
