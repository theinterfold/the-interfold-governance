"use client";

import { useMemo } from "react";
import { ProposalStatus } from "@aragon/ods";
import { useProposalExecute } from "../../hooks/useProposalExecute";
import { useToken } from "../../hooks/useToken";
import { usePastSupply } from "../../hooks/usePastSupply";
import { computeQuorum, tallyCountToTokens } from "../../utils/quorum";
import { CreditsMode } from "../../utils/types";
import { describeE3Failure, type E3FailureReason } from "../../hooks/useE3Status";
import { nextStageName } from "@/plugins/spp/utils/status";
import { ActionButton } from "@/components/input/actionButton";
import { ResultPanel, formatResultAmount, resultPercentages } from "@/components/proposalVoting/resultPanel";

interface IResult {
  option: string;
  value: string;
}

interface VoteResultCardProps {
  /** Stage-1 config, so the CTA names the stage this actually advances to. */
  vetoStage?: { vetoThreshold?: number | bigint };
  results?: IResult[];
  proposalId: bigint;
  isSignalling?: boolean;
  isTallied?: boolean;
  /** Authoritative status from useProposalStatus (already factors in quorum). */
  proposalStatus?: ProposalStatus;
  /** Quorum requirement (minParticipation) as a percentage (0-100) of total voting power. */
  minParticipation?: number;
  /** Snapshot timepoint — used to read the total voting power the quorum is measured against. */
  snapshotBlock?: bigint;
  /** Number of options — together with creditMode determines whether this is a signaling-only poll. */
  numOptions?: number;
  /** Credit mode — controls whether the tally is scaled (token mode) or raw (CONSTANT). */
  creditMode?: CreditsMode;
  /** The E3 round failed on-chain (or meets the failure condition): there will never be a tally. */
  e3Failed?: boolean;
  /** The on-chain failure reason, when `e3Failed` is set. */
  e3FailureReason?: E3FailureReason;
  /** The round meets the failure condition but nobody has sent `markE3Failed` yet. */
  e3FailurePending?: boolean;
}

export const VoteResultCard = ({
  vetoStage,
  results,
  proposalId,
  isSignalling,
  isTallied = true,
  proposalStatus,
  minParticipation,
  snapshotBlock,
  creditMode,
  e3Failed,
  e3FailureReason,
  e3FailurePending,
}: VoteResultCardProps) => {
  const { executeProposal, canExecute, isConfirming: isConfirmingExecution } = useProposalExecute(proposalId);
  const { decimals, symbol } = useToken();
  const pastSupply = usePastSupply(snapshotBlock);

  // Undefined until the on-chain read lands — tally scaling depends on it, so the
  // derived token figures stay empty rather than being computed against a guess.
  const tokenDecimals = decimals === undefined ? undefined : Number(decimals);
  const unitLabel = creditMode === CreditsMode.CONSTANT ? "credits" : symbol && symbol.length > 0 ? symbol : "tokens";

  const values = useMemo(() => (results ?? []).map((result) => BigInt(result.value || "0")), [results]);
  const percentages = resultPercentages(values);
  const totalVotes = values.reduce((sum, value) => sum + value, 0n);
  const amount = (value: bigint) =>
    tokenDecimals === undefined ? "—" : formatResultAmount(tallyCountToTokens(value, creditMode, tokenDecimals));
  // CRISP tally units are scaled; preserve its own contract-aligned quorum calculation.
  const quorum =
    tokenDecimals === undefined || minParticipation == null
      ? null
      : computeQuorum(totalVotes, pastSupply, minParticipation, creditMode, tokenDecimals);

  // Before the empty-results guard: a failed round usually has no tally at all, and that is
  // exactly the case where the reader most needs to be told why.
  if (e3Failed) {
    return (
      <div className="vote-panel">
        <div className="vp-head">
          <h3>Result</h3>
          <span className="vp-meta" style={{ color: "var(--critical, #a84932)" }}>
            Round failed
          </span>
        </div>
        <div className="vp-body items-center text-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--critical, #a84932)" }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="vp-note text-center" style={{ fontWeight: 600 }}>
            The encrypted vote round failed
          </p>
          <p className="vp-note text-center">
            {describeE3Failure(e3FailureReason)} This proposal could not be tallied or executed.
          </p>
          {/* Interfold does not fail a round by itself — `markE3Failed` is a permissionless call
              someone has to send once the deadline passes. Until then the round still reads as
              live on-chain, and the refund cannot be claimed. */}
          {e3FailurePending && (
            <p className="vp-note text-center">
              The failure has not been recorded on-chain yet. Anyone can finalise it, which also unlocks the fee refund.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!isTallied) {
    return (
      <div className="vote-panel">
        <div className="vp-head">
          <h3>Result</h3>
          <span className="vp-meta">Tallying</span>
        </div>
        <div className="vp-body items-center text-center">
          <svg
            className="animate-spin"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: "var(--accent)" }}
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <p className="vp-note text-center">
            Results are being tallied by the Interfold network. This may take a few minutes.
          </p>
        </div>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <ResultPanel
      rows={results.map((result, index) => ({
        option: result.option,
        index,
        percentage: percentages[index],
        amount: `${amount(values[index])} ${unitLabel}`,
      }))}
      total={`${amount(totalVotes)} ${unitLabel}`}
      status={proposalStatus}
      quorum={quorum}
      submitted={proposalStatus === ProposalStatus.EXECUTED}
      action={
        canExecute && !isSignalling ? (
          <ActionButton
            className="mt-4 w-full"
            intent="vote"
            disabled={isConfirmingExecution}
            isLoading={isConfirmingExecution}
            onClick={executeProposal}
          >
            Submit result & advance to {nextStageName(vetoStage)} stage
          </ActionButton>
        ) : undefined
      }
    />
  );
};
