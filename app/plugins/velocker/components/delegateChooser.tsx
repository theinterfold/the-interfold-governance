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
  const searchRef = useRef<HTMLInputElement>(null);
  const selfSelected =
    (draft ? (selected ?? currentDelegate) : currentDelegate)?.toLowerCase() === account.toLowerCase();
  const noneSelected = (draft ? (selected ?? currentDelegate) : currentDelegate) === ADDRESS_ZERO;
  const lookup = useDelegateSearch(search);

  useEffect(() => {
    if (active) searchRef.current?.focus({ preventScroll: true });
  }, [active]);

  return (
    <div className="delegate-choose">
      <p className="delegate-purpose">
        Choose who votes with your locked FOLD. You keep ownership and control withdrawals.
      </p>
      <DelegationAmount lockedAmount={lockedAmount} />
      <div className="delegate-quick-actions" aria-label="Delegation shortcuts">
        <PowerAction
          affordance={selfSelected ? "check" : "wallet"}
          disabled={selfSelected || pending}
          onClick={() => onPick(account)}
          aria-label={selfSelected ? "Your wallet selected" : "Delegate to your wallet"}
        >
          {selfSelected ? "Your wallet selected" : "Delegate to your wallet"}
        </PowerAction>
        <PowerAction
          affordance={noneSelected ? "check" : "close"}
          disabled={noneSelected || pending}
          onClick={() => onPick(ADDRESS_ZERO)}
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
        <div className="delegate-picker-scroll">
          <DelegateList
            layout="picker"
            search={search}
            lookup={lookup}
            pending={pending}
            refreshKey={refreshKey}
            onSelect={onPick}
            allowCurrentSelection={!!draft}
            selectedAddress={draft ? (selected ?? currentDelegate) : undefined}
          />
        </div>
      </div>
    </div>
  );
}
