import { formatUnits } from "viem";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { compactNumber } from "@/utils/numbers";

export type CreationRequirement = {
  minimum?: bigint;
  votingPower?: bigint;
  loading: boolean;
};

/** The selected voting method's requirement, shared by every proposal composer. */
export function ProposalCreationRequirement({ minimum, votingPower, loading }: CreationRequirement) {
  const decimals = useTokenDecimals();
  const format = (value?: bigint) =>
    value === undefined || decimals === undefined
      ? "-"
      : `${compactNumber(formatUnits(value, decimals))} ${PUB_TOKEN_SYMBOL}`;

  return (
    <dl className="composer-creation-requirement" aria-label="Proposal creation requirement">
      <div>
        <dt>Minimum voting power</dt>
        <dd>{format(minimum)}</dd>
      </div>
      <div>
        <dt>Your voting power</dt>
        <dd>{loading ? "Checking…" : format(votingPower)}</dd>
      </div>
    </dl>
  );
}
