"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { ProposalStatus } from "@aragon/ods";
import { useProposalExecute } from "../../hooks/useProposalExecute";
import { useToken } from "../../hooks/useToken";
import { usePastSupply } from "../../hooks/usePastSupply";
import { useVotingPowerDivisor } from "../../hooks/useVotingPowerDivisor";
import { computeQuorum, tallyCountToTokens } from "../../utils/quorum";
import { CreditsMode } from "../../utils/types";
import { describeE3Failure, type E3FailureReason } from "../../hooks/useE3Status";
import { nextStageName } from "@/plugins/spp/utils/status";
import { ActionButton } from "@/components/input/actionButton";
import { useWalletModal } from "@/hooks/useWalletModal";
import { utcTimestamp } from "@/components/text/deadlineInfo";
import {
  ResultNotice,
  ResultPanel,
  formatResultAmount,
  resultPercentages,
} from "@/components/proposalVoting/resultPanel";

interface IResult {
  option: string;
  value: string;
}

interface VoteResultCardProps {
  /** Stage-1 config, so the CTA names the stage this actually advances to. */
  vetoStage?: { vetoThreshold?: number | bigint };
  results?: IResult[];
  proposalId: bigint;
  /** The round's E3 id — the CRISP program records the divisor that scales the tally. */
  e3Id?: bigint;
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
  /** Turnout fell short of the frozen quorum (from `useProposalStatus`): the vote did not go against it. */
  quorumNotMet?: boolean;
  /** The E3 round failed on-chain (or meets the failure condition): there will never be a tally. */
  e3Failed?: boolean;
  /** The on-chain failure reason, when `e3Failed` is set. */
  e3FailureReason?: E3FailureReason;
  /** The round meets the failure condition but nobody has sent `markE3Failed` yet. */
  e3FailurePending?: boolean;
  voteStartMs?: number;
  voteEndMs?: number;
  foundationStageStarted?: boolean;
  networkResultPublished?: boolean;
}

export const VoteResultCard = ({
  vetoStage,
  results,
  proposalId,
  e3Id,
  isSignalling,
  isTallied = true,
  proposalStatus,
  minParticipation,
  snapshotBlock,
  creditMode,
  quorumNotMet,
  e3Failed,
  e3FailureReason,
  e3FailurePending,
  voteStartMs,
  voteEndMs,
  foundationStageStarted,
  networkResultPublished,
}: VoteResultCardProps) => {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const { open: openWallet, isOpen: walletOpen } = useWalletModal();
  const connected = isConnected && !!address;
  const connecting = isConnecting || isReconnecting;
  const { executeProposal, canExecute, isConfirming: isConfirmingExecution } = useProposalExecute(proposalId);
  const { decimals, symbol } = useToken();
  const pastSupply = usePastSupply(snapshotBlock);

  // Undefined until the on-chain reads land — tally scaling depends on both, so the derived
  // token figures stay empty rather than being computed against a guess.
  const tokenDecimals = decimals === undefined ? undefined : Number(decimals);
  const divisor = useVotingPowerDivisor(e3Id);
  const unitLabel = creditMode === CreditsMode.CONSTANT ? "credits" : symbol && symbol.length > 0 ? symbol : "tokens";

  const values = useMemo(() => (results ?? []).map((result) => BigInt(result.value || "0")), [results]);
  const percentages = resultPercentages(values);
  const totalVotes = values.reduce((sum, value) => sum + value, 0n);
  const amount = (value: bigint) => {
    const tokens =
      tokenDecimals === undefined ? undefined : tallyCountToTokens(value, creditMode, tokenDecimals, divisor);
    return tokens === undefined ? "-" : formatResultAmount(tokens);
  };
  // CRISP tally counts are in units of the round's recorded divisor; mirror the contract's quorum.
  const quorum =
    minParticipation == null ? null : computeQuorum(totalVotes, pastSupply, minParticipation, creditMode, divisor);

  // Before the empty-results guard: a failed round usually has no tally at all, and that is
  // exactly the case where the reader most needs to be told why.
  if (e3Failed) {
    return (
      <ResultNotice state="Voting closed" title="Round failed">
        <p className="vp-note">{describeE3Failure(e3FailureReason)} This proposal could not be tallied or executed.</p>
        {/* Recording the failure on-chain also makes the fee refund available. */}
        {e3FailurePending && (
          <p className="vp-note">
            The failure has not been recorded on-chain yet. Anyone can finalise it, which also unlocks the fee refund.
          </p>
        )}
      </ResultNotice>
    );
  }

  if (!isTallied) {
    const start = voteStartMs !== undefined && Date.now() < voteStartMs ? utcTimestamp(voteStartMs) : undefined;
    const notStarted = start !== undefined;
    const votingOpen = !notStarted && voteEndMs !== undefined && Date.now() < voteEndMs;
    return (
      <ResultNotice
        state={notStarted ? "Not started" : votingOpen ? "Voting open" : "Voting closed"}
        title={
          networkResultPublished
            ? "Result published"
            : notStarted
              ? "Voting has not started"
              : votingOpen
                ? "Voting is open"
                : foundationStageStarted
                  ? "Loading voting results"
                  : "Awaiting tally"
        }
      >
        <p className="vp-note">
          {networkResultPublished
            ? "The network has published the result. The voting totals are not available here yet."
            : start
              ? `Voting starts ${start.date}, ${start.clock}.`
              : votingOpen
                ? "The result will be available after the tally is published."
                : foundationStageStarted
                  ? "The Foundation stage has started. The voting tally is not available here yet."
                  : "The result has not been published. The Foundation stage has not started."}
        </p>
      </ResultNotice>
    );
  }

  if (!results || results.length === 0) {
    return (
      <ResultNotice state="Voting closed" title="Loading voting results">
        <p className="vp-note">The voting totals are not available here yet.</p>
      </ResultNotice>
    );
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
      isEmpty={totalVotes === 0n}
      quorum={quorum}
      quorumNotMet={quorumNotMet}
      submitted={proposalStatus === ProposalStatus.EXECUTED}
      action={
        canExecute && !isSignalling ? (
          <ActionButton
            className="proposal-result-action mt-4 w-full"
            intent="vote"
            disabled={isConfirmingExecution || connecting || walletOpen}
            isLoading={isConfirmingExecution || connecting}
            onClick={() => {
              if (connected) executeProposal();
              else void openWallet();
            }}
          >
            {connecting
              ? "Connecting wallet…"
              : connected
                ? `Submit result & advance to ${nextStageName(vetoStage)} stage`
                : "Connect to submit result"}
          </ActionButton>
        ) : undefined
      }
    />
  );
};
