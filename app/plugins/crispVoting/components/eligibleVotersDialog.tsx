import { useMemo, useRef, useState, type RefObject } from "react";
import { formatUnits } from "viem";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { SearchField } from "@/components/input/searchField";
import { ActionButton } from "@/components/input/actionButton";
import { If } from "@/components/if";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { AddressText } from "@/components/text/address";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useEligibleVoters } from "../hooks/useEligibleVoters";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";

import type { CreditsMode } from "../utils/types";
import type { EligibleVoterRow, VerificationCheck } from "../hooks/useEligibleVoters";

/** Rows rendered before the "show more" cut — keeps very large sets responsive. */
const PAGE_SIZE = 100;

interface EligibleVotersDialogProps {
  open: boolean;
  triggerRef?: RefObject<HTMLButtonElement>;
  onClose: () => void;
  e3Id?: bigint;
  chainSnapshot?: bigint;
  creditMode?: CreditsMode | number;
}

const STATUS_MARK: Record<VerificationCheck["status"], string> = {
  pass: "✓",
  fail: "✕",
  warn: "!",
  unknown: "–",
};

const STATUS_CLASS: Record<VerificationCheck["status"], string> = {
  pass: "text-success-600",
  fail: "text-critical-600",
  warn: "text-warning-600",
  unknown: "text-neutral-400",
};

/**
 * Lists the eligible voters for a private (CRISP) round, with each entry checked back
 * against the token at the snapshot.
 *
 * The point is not to display the server's list — that would be the server vouching for
 * itself — but to re-derive it from chain state and show where the two disagree.
 */
export const EligibleVotersDialog = ({
  open,
  triggerRef,
  onClose,
  e3Id,
  chainSnapshot,
  creditMode,
}: EligibleVotersDialogProps) => {
  const decimals = useTokenDecimals();
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const fallbackTrigger = useRef<HTMLButtonElement>(null);

  const { data, isLoading, error } = useEligibleVoters(e3Id, {
    chainSnapshot,
    creditMode,
    decimals,
    enabled: open,
  });
  const reportKey = `${e3Id}:${chainSnapshot}:${decimals}`;
  const retainedKey = useRef(reportKey);
  const lastData = useRef(data);
  if (retainedKey.current !== reportKey) {
    retainedKey.current = reportKey;
    lastData.current = undefined;
  }
  if (data) lastData.current = data;
  const shownData = data ?? lastData.current;
  const phase = isLoading ? "loading" : error ? "error" : data ? "results" : "loading";

  const filtered = useMemo(() => {
    if (!shownData) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return shownData.rows;
    return shownData.rows.filter((r) => r.address.toLowerCase().includes(q));
  }, [shownData, filter]);

  const fmt = (v?: bigint) => {
    if (v === undefined || decimals === undefined) return "—";
    // Served balances are already scaled by 10^(decimals-1), so one more decimal
    // place restores whole tokens.
    return formatUnits(v, 1);
  };

  const pct = (v: bigint) => {
    if (!shownData?.servedTotal) return "—";
    return `${((Number(v) / Number(shownData.servedTotal)) * 100).toFixed(2)}%`;
  };

  return (
    <ActionTray
      open={open}
      title="Eligible voters"
      pending={false}
      triggerRef={triggerRef ?? fallbackTrigger}
      onClose={onClose}
      size="wide"
    >
      <FluidHeight layoutKey={phase}>
        <div className="flex flex-col gap-y-4">
          <p className="text-sm text-neutral-500">
            Voting power is snapshotted when the proposal is created. Ballots stay encrypted — this shows{" "}
            <em>who could vote and with how much weight</em>, never how anyone voted. Every entry is re-read from the
            token on-chain and compared with what the CRISP server served.
          </p>

          <div className="motion-tab-panels">
            <MotionPanel active={phase === "loading"} direction="left">
              <div className="py-8">
                <PleaseWaitSpinner fullMessage="Loading and verifying the voter set…" />
              </div>
            </MotionPanel>

            <MotionPanel active={phase === "error"} direction="left">
              <p className="text-sm text-critical-600">Could not load the eligible voters from the CRISP server.</p>
            </MotionPanel>

            <MotionPanel active={phase === "results"} direction="right">
              {shownData && (
                <div className="flex flex-col gap-y-4">
                  {/* Verification summary */}
                  <div className="flex flex-col gap-y-2 rounded-xl border border-neutral-200 p-4">
                    {shownData.checks.map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-x-4 text-sm">
                        <span className="flex min-w-0 flex-1 items-start gap-x-2">
                          <span className={`font-mono ${STATUS_CLASS[c.status]}`}>{STATUS_MARK[c.status]}</span>
                          <span className="text-neutral-800">{c.label}</span>
                        </span>
                        <span className="font-mono min-w-0 flex-1 break-all text-right text-xs text-neutral-500">
                          {c.detail}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-neutral-500">
                      {shownData.rows.length} eligible {shownData.rows.length === 1 ? "voter" : "voters"}
                      {shownData.chainSnapshot !== undefined && (
                        <>
                          {" · "}snapshot{" "}
                          <span className="font-mono text-xs">{shownData.chainSnapshot.toString()}</span>{" "}
                          <span className="text-neutral-400">(token clock)</span>
                        </>
                      )}
                    </span>
                    <SearchField
                      label="Search eligible voters"
                      placeholder="Wallet address"
                      value={filter}
                      onChange={(value) => {
                        setFilter(value);
                        setLimit(PAGE_SIZE);
                      }}
                    />
                  </div>

                  <div className="max-h-[45vh] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-neutral-0">
                        <tr className="ui-table-head border-b border-neutral-200">
                          <th scope="col" className="py-2">
                            Address
                          </th>
                          <th scope="col" className="ui-number py-2">
                            Voting power
                          </th>
                          <th scope="col" className="ui-number py-2">
                            Share
                          </th>
                          <th scope="col" className="py-2 pl-4">
                            Verified
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, limit).map((row) => (
                          <VoterRow key={row.address} row={row} />
                        ))}
                      </tbody>
                    </table>

                    <If true={filtered.length > limit}>
                      <div className="py-3 text-center">
                        <ActionButton size="compact" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                          Show more ({filtered.length - limit} remaining)
                        </ActionButton>
                      </div>
                    </If>

                    <If true={!filtered.length}>
                      <p className="py-6 text-center text-sm text-neutral-500">No addresses match that filter.</p>
                    </If>
                  </div>
                </div>
              )}
            </MotionPanel>
          </div>
        </div>
      </FluidHeight>
    </ActionTray>
  );

  function VoterRow({ row }: { row: EligibleVoterRow }) {
    return (
      <tr className="border-b border-neutral-100 last:border-b-0">
        <td className="py-2">
          <span className="flex items-center gap-x-2">
            {/* AddressText tags the connected wallet itself ("Your wallet"), so the voter's own row
                needs no separate marker. Not nested inside another anchor, so it links out to the
                explorer: these rows are the main reason someone opens this dialog. */}
            <AddressText bold={false}>{row.address}</AddressText>
          </span>
        </td>
        <td className="ui-number py-2 text-sm">
          {fmt(row.servedBalance)} {PUB_TOKEN_SYMBOL}
        </td>
        <td className="ui-number py-2 text-sm text-neutral-500">{pct(row.servedBalance)}</td>
        <td className="py-2 pl-4 text-left">
          {row.onChainPower === undefined ? (
            <span className="font-mono text-xs text-neutral-400">–</span>
          ) : row.matches ? (
            <span className="font-mono text-xs text-success-600">✓</span>
          ) : (
            <span
              className="font-mono text-xs text-critical-600"
              title={`on-chain ${row.expectedBalance?.toString()} vs served ${row.servedBalance.toString()}`}
            >
              ✕ mismatch
            </span>
          )}
        </td>
      </tr>
    );
  }
};
