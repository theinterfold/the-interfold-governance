import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { exactNumber } from "@/utils/numbers";
import { formatUnits } from "viem";
import type { VotingPowerBreakdown } from "../hooks/useVotingPowerBreakdown";
import { PowerInfo } from "./powerInfo";
import styles from "./votingPowerInfo.module.css";

export function VotingPowerInfo({ breakdown, totalVotes }: { breakdown: VotingPowerBreakdown; totalVotes?: bigint }) {
  const decimals = useTokenDecimals();
  const amount = (value?: bigint) =>
    !breakdown.available || value === undefined || decimals === undefined
      ? "—"
      : exactNumber(formatUnits(value, decimals));
  return (
    <PowerInfo label="Voting power breakdown" compact={true} contentClassName={styles.breakdown}>
      <dl className="power-info-values" aria-label="Voting power sources">
        <div>
          <dt>Active locks delegated to you</dt>
          <dd>
            {amount(breakdown.lockedAndDelegated)} {PUB_TOKEN_SYMBOL}
          </dd>
        </div>
        <div>
          <dt>Bonded</dt>
          <dd>
            {amount(breakdown.bonded)} {PUB_TOKEN_SYMBOL}
          </dd>
        </div>
        <div>
          <dt>Vesting</dt>
          <dd>
            {amount(breakdown.vesting)} {PUB_TOKEN_SYMBOL}
          </dd>
        </div>
        {totalVotes !== undefined && (
          <div className={styles.total}>
            <dt>Your voting power</dt>
            <dd>
              {decimals === undefined ? "—" : exactNumber(formatUnits(totalVotes, decimals))} {PUB_TOKEN_SYMBOL}
            </dd>
          </div>
        )}
      </dl>
      <p>
        Active locks delegated to you + bonded + vesting FOLD. Locks in cooldown or delegated to another wallet are
        excluded.
      </p>
      <p>Proposals use the voting power recorded at their snapshot.</p>
    </PowerInfo>
  );
}
