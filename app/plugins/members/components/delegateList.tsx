import { ListTokenAmount, RowIdentifier } from "@/components/text/listValue";
import { useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useAccount } from "wagmi";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { EnsMember } from "@/components/text/ensMember";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { useDelegate } from "@/hooks/useDelegate";
import { useDelegates } from "../hooks/useDelegates";
import { DelegateStatus } from "./delegateStatus";
import { useDelegateFirstSeen } from "../hooks/useDelegateFirstSeen";
import { orderDelegates, type DelegateOrder } from "../utils/delegateOrder";
import { includeConnectedWallet } from "../utils/delegateEntries";
import { useDelegateNames } from "../hooks/useDelegateNames";
import type { useDelegateSearch } from "../hooks/useDelegateSearch";
import { matchesDelegateSearch } from "../utils/delegateSearch";
import { AddressText } from "@/components/text/address";

const PAGE_SIZE = 10;

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
  order = "power-desc",
  lookup,
  pending = false,
}: {
  refreshKey?: number;
  layout?: "default" | "table" | "picker";
  onSelect?: (address: Address) => void;
  search?: string;
  allowCurrentSelection?: boolean;
  excludeAddress?: Address;
  selectedAddress?: Address;
  order?: DelegateOrder;
  lookup?: ReturnType<typeof useDelegateSearch>;
  pending?: boolean;
}) {
  const { address, isConnected } = useAccount();
  // Selection callbacks handle connection and review; direct transactions require a wallet.
  const canSelect = !!onSelect || (isConnected && !!address);
  const { delegates, totalSupply, isLoading, error, refetch: refetchDelegates } = useDelegates();
  const firstSeen = useDelegateFirstSeen(order === "newest", refreshKey);
  const { delegatesTo, votingPower, refetch: refetchMyVotes } = useTokenVotes(address);
  const directory = includeConnectedWallet(delegates, address, votingPower);
  const memberNames = useDelegateNames(directory, lookup?.searchNames ?? false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, order, address, excludeAddress]);

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
    if (refreshKey > 0) {
      refetchDelegates();
      refetchMyVotes();
    }
  }, [refreshKey, refetchDelegates, refetchMyVotes]);

  if (isLoading || (order === "newest" && firstSeen.isPending)) {
    return (
      <div className="py-6">
        <PleaseWaitSpinner fullMessage={order === "newest" ? "Loading delegation history…" : "Loading delegates…"} />
      </div>
    );
  }
  if (error) return <p className="text-sm text-critical-600">{error}</p>;
  if (order === "newest" && (firstSeen.isError || !firstSeen.data?.size))
    return (
      <div className="delegate-sort-feedback" role="status">
        <p>Delegation history is unavailable. Choose a voting power sort or try again.</p>
        <button type="button" onClick={() => void firstSeen.refetch()}>
          Try again
        </button>
      </div>
    );
  if (!directory.length && !search.trim()) {
    return <p className="text-sm text-neutral-500">No delegates yet — be the first by delegating to yourself above.</p>;
  }

  const pct = (v: bigint) => {
    if (totalSupply <= 0n) return "—";
    const percentage = (Number(v) / Number(totalSupply)) * 100;
    return percentage > 0 && percentage < 0.01 ? "<0.01%" : `${percentage.toFixed(2)}%`;
  };
  const visibleDelegates = orderDelegates(directory, order, firstSeen.data).filter(
    (d) =>
      d.address.toLowerCase() !== excludeAddress?.toLowerCase() &&
      matchesDelegateSearch(
        d.address,
        search,
        memberNames.names.get(d.address.toLowerCase() as Address),
        lookup?.resolvedAddress
      )
  );
  const customAddress = lookup?.resolvedAddress;
  const showCustomAddress =
    !!customAddress &&
    !!onSelect &&
    customAddress.toLowerCase() !== excludeAddress?.toLowerCase() &&
    !directory.some((entry) => entry.address.toLowerCase() === customAddress.toLowerCase());
  const searching = memberNames.searching || (lookup?.resolving ?? false) || (lookup?.settling ?? false);
  if (!visibleDelegates.length && !showCustomAddress && !searching && !memberNames.failed && !lookup?.message)
    return <p className="power-help py-6">{search.trim() ? "No matching delegates." : "No other delegates yet."}</p>;

  return (
    <div
      data-numbered={layout === "table" || undefined}
      className={
        layout === "table" ? "power-delegate-list" : layout === "picker" ? "delegate-picker-list" : "flex flex-col"
      }
    >
      {showCustomAddress && (
        <div className={layout === "picker" ? "delegate-picker-row" : "power-delegate-row"}>
          <div className="power-delegate-identity">
            <AddressText label={lookup?.name} withAddress={!!lookup?.name}>
              {customAddress}
            </AddressText>
          </div>
          <div className={layout === "table" ? "power-delegate-data" : "delegate-picker-data"}>
            <PowerAction
              size="compact"
              className="delegate-picker-action delegate-search-action"
              affordance="next"
              disabled={!canSelect || pending || isConfirming}
              onClick={() => onSelect?.(customAddress)}
            >
              Select
            </PowerAction>
          </div>
        </div>
      )}
      {visibleDelegates.slice(0, visibleCount).map((d, i) => {
        const alreadyDelegated =
          isConnected && !!address && !!delegatesTo && delegatesTo.toLowerCase() === d.address.toLowerCase();
        const alreadySelected = selectedAddress?.toLowerCase() === d.address.toLowerCase();
        return (
          <div
            key={d.address}
            data-current-delegate={alreadyDelegated || undefined}
            className={
              layout === "picker"
                ? "delegate-picker-row"
                : layout === "table"
                  ? "power-delegate-row"
                  : "flex items-center justify-between gap-x-4 border-t border-neutral-100 py-3 first:border-t-0"
            }
          >
            <div className="power-delegate-identity flex min-w-0 items-center gap-x-3">
              {layout !== "picker" && (
                <span className="delegate-row-number">
                  <RowIdentifier>{i + 1}</RowIdentifier>
                </span>
              )}
              <div className="delegate-identity-content">
                {layout === "picker" && alreadyDelegated && (
                  <span className="delegate-current-label">Current delegate</span>
                )}
                <div className="flex min-w-0 items-center">
                  <EnsMember address={d.address} />
                </div>
              </div>
            </div>
            <div className={layout === "table" ? "power-delegate-data" : "delegate-picker-data"}>
              <div className="power-delegate-votes ui-number">
                <div className="text-sm font-semibold text-neutral-800">
                  <ListTokenAmount
                    value={decimals === undefined ? "—" : compactNumber(formatUnits(d.votingPower, decimals))}
                    symbol={PUB_TOKEN_SYMBOL}
                  />
                </div>
                <div className="text-xs text-neutral-500">{pct(d.votingPower)}</div>
              </div>
              {alreadyDelegated && (!allowCurrentSelection || alreadySelected) ? (
                <DelegateStatus />
              ) : (
                <PowerAction
                  size="compact"
                  className={layout === "picker" ? "delegate-picker-action" : undefined}
                  affordance={alreadySelected ? "check" : "next"}
                  aria-haspopup={onSelect && layout === "table" ? "dialog" : undefined}
                  isLoading={isConfirming}
                  disabled={
                    !canSelect ||
                    pending ||
                    isConfirming ||
                    alreadySelected ||
                    (alreadyDelegated && !allowCurrentSelection)
                  }
                  onClick={() => (onSelect ? onSelect(d.address) : delegate(d.address))}
                >
                  {alreadySelected
                    ? "Selected"
                    : onSelect
                      ? layout === "picker"
                        ? "Select"
                        : "Select delegate"
                      : "Delegate"}
                </PowerAction>
              )}
            </div>
          </div>
        );
      })}
      {searching && (
        <p className="power-help py-3" role="status">
          Searching delegates…
        </p>
      )}
      {memberNames.failed && (
        <div className="delegate-sort-feedback" role="status">
          <p>Some ENS names couldn’t be searched. You can still search by wallet address.</p>
          <button type="button" onClick={() => void memberNames.retry()}>
            Try again
          </button>
        </div>
      )}
      {visibleDelegates.length > PAGE_SIZE && (
        <div className="delegate-list-pagination">
          <p role="status" aria-live="polite">
            {Math.min(visibleCount, visibleDelegates.length)} of {visibleDelegates.length} delegates
          </p>
          {visibleCount < visibleDelegates.length && (
            <PowerAction type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
              Load more
            </PowerAction>
          )}
        </div>
      )}
    </div>
  );
}
