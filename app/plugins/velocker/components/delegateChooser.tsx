import { useEffect, useRef, useState } from "react";
import { Button, MemberAvatar } from "@aragon/ods";
import { isAddress, type Address } from "viem";
import { ADDRESS_ZERO } from "@/utils/evm";
import { DelegateList } from "@/plugins/members/components/delegateList";

type Props = {
  active: boolean;
  account: Address;
  currentDelegate?: Address;
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
  const customAddress = search.trim();
  const validAddress = isAddress(customAddress) && customAddress !== ADDRESS_ZERO;

  useEffect(() => {
    if (active) searchRef.current?.focus({ preventScroll: true });
  }, [active]);

  return (
    <div className="delegate-choose">
      <p className="delegate-purpose">
        Choose who votes with your locked FOLD. You keep ownership and control withdrawals.
      </p>
      <div className="power-delegate-input">
        <label htmlFor="delegate-search" className="power-label">
          Find or enter a wallet address
        </label>
        <input
          id="delegate-search"
          ref={searchRef}
          placeholder="0x…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {validAddress && customAddress.toLowerCase() !== account.toLowerCase() && (
        <button
          type="button"
          className="delegate-custom"
          disabled={pending}
          onClick={() => onPick(customAddress as Address)}
        >
          {draft ? "Use this address" : "Review this address"} <span aria-hidden="true">→</span>
        </button>
      )}
      <div className="delegate-picker-scroll delegate-picker-options">
        <div className="delegate-picker-row delegate-picker-self">
          <div className="delegate-self-identity">
            <MemberAvatar address={account} alt="Your wallet" size="sm" />
            <div>
              <strong>Myself</strong>
              <p>Vote with your own wallet</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="tertiary"
            disabled={selfSelected || pending}
            onClick={() => onPick(account)}
            aria-label={selfSelected ? "Myself selected" : "Select myself"}
          >
            {selfSelected ? (draft ? "Selected" : "Delegated") : "Select"}
          </Button>
        </div>
        <DelegateList
          layout="picker"
          search={search}
          refreshKey={refreshKey}
          onSelect={onPick}
          allowCurrentSelection={!!draft}
          excludeAddress={account}
          selectedAddress={draft ? selected : undefined}
        />
      </div>
    </div>
  );
}
