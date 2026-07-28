import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { Button, DialogContent, DialogHeader, DialogRoot, InputText } from "@aragon/ods";
import { If } from "@/components/if";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { AddressText } from "@/components/text/address";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useEligibleVoters } from "../hooks/useEligibleVoters";

import type { CreditsMode } from "../utils/types";
import type { EligibleVoterRow, VerificationCheck } from "../hooks/useEligibleVoters";

/** Rows rendered before the "show more" cut — keeps very large sets responsive. */
const PAGE_SIZE = 100;

interface EligibleVotersDialogProps {
  open: boolean;
  onClose: () => void;
  e3Id?: bigint;
  chainSnapshot?: bigint;
  chainThreshold?: bigint;
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
  onClose,
  e3Id,
  chainSnapshot,
  chainThreshold,
  creditMode,
}: EligibleVotersDialogProps) => {
  const { address } = useAccount();
  const decimals = useTokenDecimals();
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, error } = useEligibleVoters(e3Id, {
    chainSnapshot,
    chainThreshold,
    creditMode,
    decimals,
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter((r) => r.address.toLowerCase().includes(q));
  }, [data, filter]);

  const fmt = (v?: bigint) => {
    if (v === undefined || decimals === undefined) return "—";
    // Served balances are already scaled by 10^(decimals-1), so one more decimal
    // place restores whole tokens.
    return formatUnits(v, 1);
  };

  const pct = (v: bigint) => {
    if (!data?.servedTotal) return "—";
    return `${((Number(v) / Number(data.servedTotal)) * 100).toFixed(2)}%`;
  };

  return (
    <DialogRoot open={open} containerClassName="!max-w-[760px]">
      <DialogHeader title="Eligible voters" onCloseClick={onClose} onBackClick={onClose} />
      <DialogContent className="flex flex-col gap-y-4">
        <p className="text-sm text-neutral-500">
          Voting power is snapshotted when the proposal is created. Ballots stay encrypted — this shows{" "}
          <em>who could vote and with how much weight</em>, never how anyone voted. Every entry is re-read from the
          token on-chain and compared with what the CRISP server served.
        </p>

        <If true={isLoading}>
          <div className="py-8">
            <PleaseWaitSpinner fullMessage="Loading and verifying the voter set…" />
          </div>
        </If>

        <If true={!!error}>
          <p className="text-sm text-critical-600">Could not load the eligible voters from the CRISP server.</p>
        </If>

        <If true={!!data && !isLoading}>
          {/* Verification summary */}
          <div className="flex flex-col gap-y-2 rounded-xl border border-neutral-200 p-4">
            {data?.checks.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-x-4 text-sm">
                <span className="flex items-start gap-x-2">
                  <span className={`font-mono ${STATUS_CLASS[c.status]}`}>{STATUS_MARK[c.status]}</span>
                  <span className="text-neutral-800">{c.label}</span>
                </span>
                <span className="font-mono shrink-0 text-right text-xs text-neutral-500">{c.detail}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-neutral-500">
              {data?.rows.length ?? 0} eligible {data?.rows.length === 1 ? "voter" : "voters"}
              {data?.chainSnapshot !== undefined && (
                <>
                  {" · "}snapshot <span className="font-mono text-xs">{data.chainSnapshot.toString()}</span>{" "}
                  <span className="text-neutral-400">(token clock)</span>
                </>
              )}
            </span>
            <InputText
              placeholder="Filter by address…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setLimit(PAGE_SIZE);
              }}
            />
          </div>

          <div className="max-h-[45vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-0">
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2">Address</th>
                  <th className="py-2 text-right">Voting power</th>
                  <th className="py-2 text-right">Share</th>
                  <th className="py-2 text-right">Verified</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((row) => (
                  <VoterRow key={row.address} row={row} isYou={row.address.toLowerCase() === address?.toLowerCase()} />
                ))}
              </tbody>
            </table>

            <If true={filtered.length > limit}>
              <div className="py-3 text-center">
                <Button size="sm" variant="tertiary" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                  Show more ({filtered.length - limit} remaining)
                </Button>
              </div>
            </If>

            <If true={!filtered.length}>
              <p className="py-6 text-center text-sm text-neutral-500">No addresses match that filter.</p>
            </If>
          </div>
        </If>
      </DialogContent>
    </DialogRoot>
  );

  function VoterRow({ row, isYou }: { row: EligibleVoterRow; isYou: boolean }) {
    return (
      <tr className="border-b border-neutral-100 last:border-b-0">
        <td className="py-2">
          <span className="flex items-center gap-x-2">
            <AddressText bold={false} asLink={false}>
              {row.address}
            </AddressText>
            {isYou && <span className="text-xs text-primary-400">you</span>}
          </span>
        </td>
        <td className="font-mono py-2 text-right text-xs">
          {fmt(row.servedBalance)} {PUB_TOKEN_SYMBOL}
        </td>
        <td className="font-mono py-2 text-right text-xs text-neutral-500">{pct(row.servedBalance)}</td>
        <td className="py-2 text-right">
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
