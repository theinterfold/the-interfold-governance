import { useContext, type ReactNode } from "react";
import { BallotPowerPreviewContext, useBallotPresentation } from "@/components/proposalVoting/ballotPresentation";
import { useAccount } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber, displayNumber } from "@/utils/numbers";
import { useSnapshotVotingPower } from "@/hooks/useSnapshotVotingPower";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { BallotPowerSummary } from "@/components/proposalVoting/ballotPowerSummary";

/**
 * Shows the connected account's voting power and the total, both at the proposal's snapshot.
 *
 * Reads the VOTING token named by `votingPlugin` (via `useSnapshotVotingPower`), not the raw
 * governance token. A holder's power can live entirely in an escrow position or bonded collateral,
 * where the governance token reports zero votes.
 *
 * @param snapshotTimepoint The proposal's snapshot, in the token's clock units.
 * @param votingPlugin The governance plugin whose voting token applies.
 */
export function VotingPower({
  snapshotTimepoint,
  votingPlugin,
  showTotal = true,
  compact = false,
  usedInVote = false,
  warning,
}: {
  snapshotTimepoint?: bigint;
  votingPlugin: Address;
  showTotal?: boolean;
  compact?: boolean;
  usedInVote?: boolean;
  warning?: ReactNode;
}) {
  const { address } = useAccount();
  const preview = useContext(BallotPowerPreviewContext);
  const { power: presentation } = useBallotPresentation();

  const { votingPower: yours, total } = useSnapshotVotingPower(votingPlugin, snapshotTimepoint, showTotal && !compact);

  const decimals = useTokenDecimals();
  const fmt = (v?: bigint) =>
    decimals === undefined || v === undefined ? "-" : `${compactNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;

  if (compact) {
    const info = <PowerInfo label={warning ? "About your voting power — some FOLD does not count" : "About your voting power for this proposal"}
      compact={true} tone={warning ? "warning" : "neutral"} interactive={!!warning} contentClassName={warning ? "ballot-power-help" : ""}>
      <dl className="power-info-values"><div>
        <dt>Your voting power (at snapshot)</dt><dd>{address ? fmt(yours) : "-"}</dd>
      </div></dl>
      <p>Only your snapshot voting power counts for this proposal.</p>
      {warning}
    </PowerInfo>;
    const grouped = preview && presentation !== "original";
    const total = <div className="ballot-voting-power">
      <span className="ballot-voting-power-label"><span className="ui-label-with-info">
        <span>Your voting power</span>{info}
      </span></span>
      <strong>{address ? fmt(yours) : "-"}</strong>
    </div>;
    if (!grouped) {
      if (presentation === "single" && usedInVote) return <div className="ballot-power-group">
        <BallotPowerSummary amount={address && yours !== undefined && decimals !== undefined ? fmt(yours).replace(/\.00(?=[KMBT]? )/, "") : undefined} warning={warning}>
          <p>Only your snapshot voting power counts for this proposal. This public vote uses all of it.</p>
          <dl className="power-info-values"><div><dt>Your voting power (at snapshot)</dt><dd>{address && yours !== undefined && decimals !== undefined ? `${displayNumber(formatUnits(yours, decimals))} ${PUB_TOKEN_SYMBOL}` : "Calculating…"}</dd></div></dl>
        </BallotPowerSummary>
      </div>;
      return total;
    }
    return (
      <div className="ballot-power-group" data-power-presentation={presentation}>
        {presentation === "paired" && total}
        {preview(address ? fmt(yours) : "-", info, warning)}
      </div>
    );
  }

  return (
    <div className="proposal-voting-power flex flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-4 xl:p-6">
      <p className="text-sm font-semibold text-neutral-800">Voting power</p>
      <div className="ui-fact-row text-sm">
        <span className="text-neutral-500">Yours{address ? " (at snapshot)" : ""}</span>
        <span className="font-semibold text-neutral-800">{address ? fmt(yours) : "-"}</span>
      </div>
      {showTotal && (
        <div className="ui-fact-row text-sm">
          <span className="text-neutral-500">Total</span>
          <span className="font-semibold text-neutral-800">{fmt(total)}</span>
        </div>
      )}
    </div>
  );
}
