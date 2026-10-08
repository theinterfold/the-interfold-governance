import { useAccount } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";
import { useSnapshotVotingPower } from "@/hooks/useSnapshotVotingPower";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";

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
}: {
  snapshotTimepoint?: bigint;
  votingPlugin: Address;
  showTotal?: boolean;
  compact?: boolean;
}) {
  const { address } = useAccount();

  const { votingPower: yours, total } = useSnapshotVotingPower(votingPlugin, snapshotTimepoint, showTotal && !compact);

  const decimals = useTokenDecimals();
  const fmt = (v?: bigint) =>
    decimals === undefined || v === undefined ? "-" : `${compactNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;

  if (compact) {
    return (
      <div className="ballot-voting-power">
        <span className="ballot-voting-power-label">
          <span className="ui-label-with-info">
            <span>Your voting power</span>
            <PowerInfo label="About your voting power for this proposal" compact={true}>
              <dl className="power-info-values">
                <div>
                  <dt>Your voting power (at snapshot)</dt>
                  <dd>{address ? fmt(yours) : "-"}</dd>
                </div>
              </dl>
              <p>Only your snapshot voting power counts for this proposal.</p>
            </PowerInfo>
          </span>
        </span>
        <strong>{address ? fmt(yours) : "-"}</strong>
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
