import { PUB_TOKEN_SYMBOL } from "@/constants";
import type { FoldAllocation } from "../utils/foldAllocation";
import { FoldBalanceBreakdown } from "./foldBalanceBreakdown";
import { PowerInfo } from "./powerInfo";

export function FoldBalanceInfo({ allocation }: { allocation: FoldAllocation }) {
  return (
    <PowerInfo label={`${PUB_TOKEN_SYMBOL} balance breakdown`} compact={true} contentClassName="fold-balance-popover">
      <FoldBalanceBreakdown allocation={allocation} />
    </PowerInfo>
  );
}
