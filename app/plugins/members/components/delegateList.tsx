import { useEffect } from "react";
import { formatUnits, type Address } from "viem";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useAccount } from "wagmi";
import { Button, IconType } from "@aragon/ods";
import { EnsMember } from "@/components/text/ensMember";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { useDelegate } from "@/hooks/useDelegate";
import { useDelegates } from "../hooks/useDelegates";

/**
 * @param refreshKey - bump to re-scan the directory. The page above holds its own delegate button,
 *   and this component owns the only copy of the voting-power figures, so a delegation made up
 *   there has to reach down here or the table silently keeps showing pre-delegation numbers.
 */
export function DelegateList({
  refreshKey = 0,
  layout = "default",
  onSelect,
  search = "",
  allowCurrentSelection = false,
  excludeAddress,
  selectedAddress,
}: {
  refreshKey?: number;
  layout?: "default" | "table" | "picker";
  onSelect?: (address: Address) => void;
  search?: string;
  allowCurrentSelection?: boolean;
  excludeAddress?: Address;
  selectedAddress?: Address;
}) {
  const { address } = useAccount();
  const { delegates, totalSupply, isLoading, error, refetch: refetchDelegates } = useDelegates();
  const { delegatesTo, refetch: refetchMyVotes } = useTokenVotes(address);

  // BOTH have to be refreshed after delegating, and only the first one used to be. `delegatesTo`
  // drives the "Delegated" label on the button, while every voting-power figure in the table comes
  // from `useDelegates` — so refreshing just the former flipped the label while the numbers stayed
  // frozen at their pre-delegation values: your power still counted as yours, and the address you
  // delegated to never gained it.
  //
  // The delay is kept: the node that answers the refetch may not yet have the block the receipt
  // came from, and re-reading too early just re-reads the old state.
  const { delegate, isConfirming } = useDelegate(() =>
    setTimeout(() => {
      refetchMyVotes();
      refetchDelegates();
    }, 1000 * 2)
  );
  const decimals = useTokenDecimals();

  // Skipped on mount: the hook already scans once on its own, and re-running it here would make
  // every page load pay for the directory twice.
  useEffect(() => {
    if (refreshKey > 0) refetchDelegates();
  }, [refreshKey, refetchDelegates]);

  if (isLoading) {
    return (
      <div className="py-6">
        <PleaseWaitSpinner fullMessage="Loading delegates…" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-critical-600">{error}</p>;
  if (!delegates.length) {
    return <p className="text-sm text-neutral-500">No delegates yet — be the first by delegating to yourself above.</p>;
  }

  const pct = (v: bigint) => {
    if (totalSupply <= 0n) return "—";
    const percentage = (Number(v) / Number(totalSupply)) * 100;
    return percentage > 0 && percentage < 0.01 ? "<0.01%" : `${percentage.toFixed(2)}%`;
  };
  const visibleDelegates = delegates.filter(
    (d) =>
      d.address.toLowerCase() !== excludeAddress?.toLowerCase() &&
      d.address.toLowerCase().includes(search.trim().toLowerCase())
  );
  if (!visibleDelegates.length)
    return <p className="power-help py-6">{search.trim() ? "No matching delegates." : "No other delegates yet."}</p>;

  return (
    <div
      className={
        layout === "table" ? "power-delegate-list" : layout === "picker" ? "delegate-picker-list" : "flex flex-col"
      }
    >
      {layout === "table" && (
        <div className="power-delegate-head">
          <span>Delegate</span>
          <span>Voting power</span>
          <span className="power-position-action">Action</span>
        </div>
      )}
      {visibleDelegates.map((d, i) => {
        const isYou = !!address && d.address.toLowerCase() === address.toLowerCase();
        const alreadyDelegated = !!delegatesTo && delegatesTo.toLowerCase() === d.address.toLowerCase();
        const alreadySelected = selectedAddress?.toLowerCase() === d.address.toLowerCase();
        return (
          <div
            key={d.address}
            className={
              layout === "picker"
                ? "delegate-picker-row"
                : layout === "table"
                  ? "power-delegate-row"
                  : "flex items-center justify-between gap-x-4 border-t border-neutral-100 py-3 first:border-t-0"
            }
          >
            <div className="power-delegate-identity flex min-w-0 items-center gap-x-3">
              <span className="w-6 shrink-0 text-sm text-neutral-400">{i + 1}</span>
              <div className="flex min-w-0 items-center">
                <EnsMember address={d.address} />
                {isYou && <span className="ml-2 text-xs text-primary-400">you</span>}
              </div>
            </div>
            <div className={layout === "table" ? "power-delegate-data" : "flex shrink-0 items-center gap-x-4"}>
              <div className="power-delegate-votes text-right">
                <div className="text-sm font-semibold text-neutral-800">
                  {decimals === undefined ? "—" : compactNumber(formatUnits(d.votingPower, decimals))}{" "}
                  {PUB_TOKEN_SYMBOL}
                </div>
                <div className="text-xs text-neutral-500">{pct(d.votingPower)}</div>
              </div>
              <Button
                size="sm"
                variant={layout === "table" ? "secondary" : "tertiary"}
                className={layout === "table" ? "power-action power-action-open" : undefined}
                iconRight={layout === "table" && onSelect ? IconType.CHEVRON_RIGHT : undefined}
                aria-haspopup={onSelect && layout === "table" ? "dialog" : undefined}
                isLoading={isConfirming}
                disabled={!address || alreadySelected || (alreadyDelegated && !allowCurrentSelection)}
                onClick={() => (onSelect ? onSelect(d.address) : delegate(d.address))}
              >
                {alreadySelected
                  ? "Selected"
                  : alreadyDelegated && !allowCurrentSelection
                    ? "Delegated"
                    : onSelect
                      ? layout === "picker"
                        ? "Select"
                        : "Select delegate"
                      : "Delegate"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
