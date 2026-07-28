import { useState } from "react";
import { formatUnits } from "viem";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";
import { usePastSupply } from "../hooks/usePastSupply";
import { useToken } from "../hooks/useToken";
import { tallyCountToTokens, voteScale } from "../utils/quorum";
import { EligibleVotersDialog } from "./eligibleVotersDialog";
import { CreditsMode } from "../utils/types";

import type { Proposal } from "../utils/types";

/**
 * Participation (quorum) panel for a CRISP proposal — the private twin of the
 * TokenVoting ParticipationCard. Turnout is the (scaled) tally sum converted
 * back to raw token units, compared against minParticipation% of the total
 * voting power at the snapshot. Before the tally lands, votes are encrypted
 * and turnout is unknowable.
 */
export function ParticipationCard({ proposal }: { proposal: Proposal }) {
  const pastSupply = usePastSupply(proposal.parameters.snapshotBlock);
  const { decimals } = useToken();
  const [showVoters, setShowVoters] = useState(false);

  const creditMode = proposal.parameters.creditMode;
  const tokenDecimals = decimals === undefined ? undefined : Number(decimals);

  // Turnout is scaled by 10^(decimals-1); rendering before the read lands would
  // show a figure off by orders of magnitude.
  if (tokenDecimals === undefined) return null;

  const minParticipation = Number(proposal.parameters.minParticipation ?? 0n);
  const totalVotesScaled = (proposal.tally ?? []).reduce((sum, v) => sum + (v ?? 0n), 0n);
  const totalVotesRaw = totalVotesScaled * voteScale(creditMode, tokenDecimals);
  const required = (pastSupply * BigInt(minParticipation)) / 100n;
  const reached = totalVotesRaw >= required;

  const pct = (part: bigint) => (pastSupply > 0n ? (Number(part) / Number(pastSupply)) * 100 : 0);
  const progressPct = required > 0n ? Math.min((Number(totalVotesRaw) / Number(required)) * 100, 100) : 100;

  const fmt = (v: bigint) => `${compactNumber(formatUnits(v, tokenDecimals))} ${PUB_TOKEN_SYMBOL}`;
  const votedTokens = tallyCountToTokens(totalVotesScaled, creditMode, tokenDecimals);

  return (
    <div className="flex flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-4 xl:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-800">
          Participation {proposal.isTallied && reached ? "✓" : ""}
        </p>
        {proposal.isTallied && (
          <span className="text-sm text-neutral-500">
            {pct(totalVotesRaw).toFixed(2)}% / {minParticipation}%
          </span>
        )}
      </div>

      {proposal.isTallied ? (
        <>
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
            <span className="font-semibold text-neutral-800">
              {compactNumber(votedTokens.toString())} {PUB_TOKEN_SYMBOL}
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-neutral-500">Votes are encrypted — turnout is revealed when the tally lands.</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">Required minimum</span>
        <span className="font-semibold text-neutral-800">{minParticipation === 0 ? "None" : fmt(required)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">Total voting power</span>
        <span className="font-semibold text-neutral-800">{fmt(pastSupply)}</span>
      </div>

      {/* Anyone can audit who was eligible and with what weight — the dialog re-derives
          each entry from the token at the snapshot rather than trusting the server. */}
      <button
        type="button"
        className="mt-1 text-left text-sm text-primary-400 hover:underline"
        onClick={() => setShowVoters(true)}
      >
        View eligible voters ↗
      </button>

      <EligibleVotersDialog
        open={showVoters}
        onClose={() => setShowVoters(false)}
        e3Id={proposal.e3Id}
        chainSnapshot={proposal.parameters.snapshotBlock}
        chainThreshold={proposal.parameters.minVotingPower}
        creditMode={creditMode}
      />
    </div>
  );
}
