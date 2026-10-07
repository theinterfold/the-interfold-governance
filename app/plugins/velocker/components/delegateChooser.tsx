import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { ADDRESS_ZERO } from "@/utils/evm";
import { DelegateList } from "@/plugins/members/components/delegateList";
import { useDelegateSearch } from "@/plugins/members/hooks/useDelegateSearch";
import { SearchField } from "@/components/input/searchField";
import { PowerAction } from "./powerAction";
import { DelegationAmount } from "./delegationAmount";

type Props = {
  active: boolean;
  account: Address;
  currentDelegate?: Address;
  lockedAmount?: bigint;
  selected?: Address;
  pending: boolean;
  refreshKey: number;
  draft?: boolean;
  onPick: (address: Address) => void;
};

/** The same directory is used inside the lock flow and for changing existing delegation. */
export function DelegateChooser({
  active,
  account,
  currentDelegate,
  lockedAmount,
  selected,
  pending,
  refreshKey,
  draft,
  onPick,
}: Props) {
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pointerFocus = useRef<HTMLElement | null>(null);
  const savedScroll = useRef(0);
  const selfSelected =
    (draft ? (selected ?? currentDelegate) : currentDelegate)?.toLowerCase() === account.toLowerCase();
  const noneSelected = (draft ? (selected ?? currentDelegate) : currentDelegate) === ADDRESS_ZERO;
  const lookup = useDelegateSearch(search);

  useEffect(() => {
    if (!active) return;
    if (scrollRef.current) scrollRef.current.scrollTop = savedScroll.current;
    const target = returnFocus.current;
    if (target?.isConnected && rootRef.current?.contains(target) && !target.matches(":disabled")) {
      target.focus({ preventScroll: true });
    } else searchRef.current?.focus({ preventScroll: true });
  }, [active]);
  const pick = (address: Address) => {
    const focused = document.activeElement;
    if (pointerFocus.current) returnFocus.current = pointerFocus.current;
    else if (focused instanceof HTMLElement && rootRef.current?.contains(focused)) returnFocus.current = focused;
    pointerFocus.current = null;
    savedScroll.current = scrollRef.current?.scrollTop ?? 0;
    onPick(address);
  };

  return (
    <div
      ref={rootRef}
      className="delegate-choose"
      onPointerDownCapture={(event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>("button");
        pointerFocus.current = target;
      }}
    >
      <p className="delegate-purpose">
        Choose who votes with your locked FOLD. You keep ownership and control withdrawals.
      </p>
      <DelegationAmount lockedAmount={lockedAmount} />
      <div className="delegate-quick-actions" aria-label="Delegation shortcuts">
        <PowerAction
          affordance={selfSelected ? "check" : "wallet"}
          disabled={selfSelected || pending}
          onClick={() => pick(account)}
          aria-label={selfSelected ? "Your wallet selected" : "Delegate to your wallet"}
        >
          {selfSelected ? "Your wallet selected" : "Delegate to your wallet"}
        </PowerAction>
        <PowerAction
          affordance={noneSelected ? "check" : "close"}
          disabled={noneSelected || pending}
          onClick={() => pick(ADDRESS_ZERO)}
          aria-label={noneSelected ? "No delegation selected" : "Remove delegation"}
        >
          {noneSelected ? "No delegation" : "Remove delegation"}
        </PowerAction>
      </div>
      <SearchField
        ref={searchRef}
        label="Search delegates"
        placeholder="ENS name or wallet address"
        value={search}
        onChange={setSearch}
        message={lookup.message}
      />
      <div className="delegate-picker-options">
        <div ref={scrollRef} className="delegate-picker-scroll">
          <DelegateList
            layout="picker"
            search={search}
            lookup={lookup}
            pending={pending}
            refreshKey={refreshKey}
            onSelect={pick}
            allowCurrentSelection={!!draft}
            selectedAddress={draft ? (selected ?? currentDelegate) : undefined}
          />
        </div>
      </div>
    </div>
  );
}
