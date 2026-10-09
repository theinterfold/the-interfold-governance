import { useState } from "react";
import type { Address } from "viem";
import { SearchField } from "@/components/input/searchField";
import { EnsMember } from "@/components/text/ensMember";
import { ListTokenAmount } from "@/components/text/listValue";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";
import { WalletListRow } from "@/components/walletListRow";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { CreditsMode, type EligibleVoter } from "../../utils/types";
import { tallyCountToTokens } from "../../utils/quorum";
import { useVotingPowerDivisor } from "../../hooks/useVotingPowerDivisor";

const PAGE_SIZE = 10;

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
  const decimals = useTokenDecimals();
  const divisor = useVotingPowerDivisor(e3Id);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filtered = (voters ?? []).filter((voter) => voter.address.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="delegate-choose">
      <SearchField
        label="Search eligible voters"
        placeholder="Wallet address"
        value={search}
        onChange={(value) => {
          setSearch(value);
          setVisibleCount(PAGE_SIZE);
          onSelect("");
        }}
        message={
          loading
            ? "Loading eligible voters…"
            : voters
              ? `${search.trim() ? `${filtered.length} of ` : ""}${voters.length} eligible ${voters.length === 1 ? "voter" : "voters"}`
              : undefined
        }
      />
      {voters && (
        <div className="delegate-picker-options">
          <div className="delegate-picker-scroll">
            <div className="delegate-picker-list" role="group" aria-label="Eligible voters">
              {filtered.slice(0, visibleCount).map((voter) => {
                const isSelected = voter.address.toLowerCase() === selected.toLowerCase();
                const tokens =
                  decimals === undefined ? undefined : tallyCountToTokens(voter.balance, creditMode, decimals, divisor);
                return (
                  <WalletListRow
                    key={voter.address}
                    identity={
                      <div className="delegate-identity-content">
                        <EnsMember address={voter.address as Address} />
                        <div className="pl-9">
                          <ListTokenAmount
                            value={tokens === undefined ? "-" : compactNumber(tokens)}
                            symbol={creditMode === CreditsMode.CONSTANT ? "credits" : PUB_TOKEN_SYMBOL}
                          />
                        </div>
                      </div>
                    }
                  >
                    <PowerAction
                      size="compact"
                      className="delegate-picker-action delegate-search-action"
                      affordance={isSelected ? "check" : "next"}
                      disabled={pending || isSelected}
                      aria-label={`${isSelected ? "Selected" : "Select"} ${voter.address}`}
                      onClick={() => onSelect(voter.address)}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </PowerAction>
                  </WalletListRow>
                );
              })}
              {!filtered.length && (
                <p className="power-help py-3" role="status">
                  {voters.length
                    ? "No eligible wallets match this address."
                    : "No eligible voters are available for this proposal."}
                </p>
              )}
            </div>
          </div>
          {filtered.length > PAGE_SIZE && (
            <div className="delegate-list-pagination">
              <p role="status" aria-live="polite">
                {Math.min(visibleCount, filtered.length)} of {filtered.length} eligible voters
              </p>
              {visibleCount < filtered.length && (
                <PowerAction onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Load more</PowerAction>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
