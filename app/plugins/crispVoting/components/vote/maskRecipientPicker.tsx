import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { MemberAvatar } from "@aragon/ods";
import { SearchField } from "@/components/input/searchField";
import { ActionIcon } from "@/components/input/actionIcon";
import { ListTokenAmount } from "@/components/text/listValue";
import { useMemberName } from "@/hooks/useMemberName";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { blockieDataUrl } from "@/utils/blockies";
import { equalAddresses, formatHexString } from "@/utils/evm";
import { compactNumber } from "@/utils/numbers";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { CreditsMode, type EligibleVoter } from "../../utils/types";
import { tallyCountToTokens } from "../../utils/quorum";
import { useVotingPowerDivisor } from "../../hooks/useVotingPowerDivisor";

/** Rows added each time the end of the list scrolls into view. */
const PAGE_SIZE = 25;

/**
 * Chooses the wallet that a mask covers. The list scrolls in one region and adds rows as its end
 * comes into view. Each row selects its wallet, and a selection collapses the list to one summary
 * row, so the review and its submit action stay in view.
 */
export function MaskRecipientPicker({
  voters,
  loading,
  selected,
  pending,
  creditMode,
  e3Id,
  onSelect,
}: {
  voters?: EligibleVoter[];
  loading: boolean;
  selected: string;
  pending: boolean;
  creditMode?: CreditsMode;
  /** The round whose recorded divisor scales the served balances. */
  e3Id?: bigint;
  onSelect: (address: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const decimals = useTokenDecimals();
  const divisor = useVotingPowerDivisor(e3Id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const query = search.trim().toLowerCase();
  const filtered = (voters ?? []).filter((voter) => voter.address.toLowerCase().includes(query));
  const shown = filtered.slice(0, visibleCount);
  const selectedVoter = selected ? voters?.find((voter) => equalAddresses(voter.address, selected)) : undefined;
  const showList = choosing || !selectedVoter;
  const more = visibleCount < filtered.length;

  const amount = (voter: EligibleVoter) => {
    const tokens =
      decimals === undefined ? undefined : tallyCountToTokens(voter.balance, creditMode, decimals, divisor);
    return (
      <ListTokenAmount
        value={tokens === undefined ? "-" : compactNumber(tokens)}
        symbol={creditMode === CreditsMode.CONSTANT ? "credits" : PUB_TOKEN_SYMBOL}
      />
    );
  };

  useEffect(() => {
    const end = endRef.current;
    if (!showList || !more || !end) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisibleCount((count) => count + PAGE_SIZE);
      },
      { root: scrollRef.current, rootMargin: "120px 0px" }
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [showList, more, visibleCount]);

  if (!showList) {
    return (
      <div className="mask-recipient-selected">
        <RecipientIdentity address={selectedVoter.address} />
        {amount(selectedVoter)}
        <PowerAction size="compact" disabled={pending} onClick={() => setChoosing(true)}>
          Change
        </PowerAction>
      </div>
    );
  }

  return (
    <div className="mask-recipient-picker">
      <SearchField
        label="Search eligible voters"
        placeholder="Wallet address"
        value={search}
        onChange={(value) => {
          setSearch(value);
          setVisibleCount(PAGE_SIZE);
          scrollRef.current?.scrollTo({ top: 0 });
        }}
        message={
          loading
            ? "Loading eligible voters…"
            : voters
              ? `${query ? `${filtered.length} of ` : ""}${voters.length} eligible ${voters.length === 1 ? "voter" : "voters"}`
              : undefined
        }
      />
      {voters && (
        <div ref={scrollRef} className="mask-recipient-scroll">
          <div className="mask-recipient-list" role="group" aria-label="Eligible voters">
            {shown.map((voter) => {
              const isSelected = !!selectedVoter && equalAddresses(voter.address, selectedVoter.address);
              return (
                <button
                  key={voter.address}
                  type="button"
                  className="mask-recipient-row"
                  aria-pressed={isSelected}
                  disabled={pending}
                  title={voter.address}
                  onClick={() => {
                    onSelect(voter.address);
                    setChoosing(false);
                    setSearch("");
                    setVisibleCount(PAGE_SIZE);
                  }}
                >
                  <RecipientIdentity address={voter.address} />
                  {amount(voter)}
                  <span className="mask-recipient-mark" aria-hidden="true">
                    {isSelected && <ActionIcon name="check" />}
                  </span>
                </button>
              );
            })}
            {!filtered.length && (
              <p className="power-help px-3 py-3" role="status">
                {voters.length
                  ? "No eligible wallets match this address."
                  : "No eligible voters are available for this proposal."}
              </p>
            )}
            {more && <div ref={endRef} className="mask-recipient-end" aria-hidden="true" />}
          </div>
        </div>
      )}
      {choosing && selectedVoter && (
        <button type="button" className="vp-foot-note vp-mode-toggle" onClick={() => setChoosing(false)}>
          Keep {formatHexString(selectedVoter.address)}
        </button>
      )}
    </div>
  );
}

/** Blockie and ENS name, or the short address. Plain text: the whole row is the action. */
function RecipientIdentity({ address }: { address: string }) {
  const name = useMemberName(address as Address);
  return (
    <span className="mask-recipient-identity">
      <MemberAvatar src={blockieDataUrl(address) ?? ""} address={address} alt="" size="sm" />
      <span className="mask-recipient-name">{name ?? formatHexString(address)}</span>
    </span>
  );
}
