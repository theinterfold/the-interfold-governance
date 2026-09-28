import { formatUnits } from "viem";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { compactNumber } from "@/utils/numbers";

/** Only the locks covered by the delegation belong in its chooser and review. */
export function DelegationAmount({ lockedAmount }: { lockedAmount?: bigint }) {
  const decimals = useTokenDecimals();
  const format = (value?: bigint) =>
    value === undefined || decimals === undefined ? "—" : compactNumber(formatUnits(value, decimals));
  return (
    <dl className="delegate-voting-power">
      <dt>Your locked {PUB_TOKEN_SYMBOL}</dt>
      <dd className="ui-number">
        {format(lockedAmount)} <span>{PUB_TOKEN_SYMBOL}</span>
      </dd>
    </dl>
  );
}
