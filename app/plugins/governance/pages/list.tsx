import { useAccount, useBlockNumber } from "wagmi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconType } from "@aragon/ods";
import classNames from "classnames";
import Link from "next/link";
import { formatUnits, isAddress } from "viem";
import { Else, If, Then } from "@/components/if";
import { MainSection } from "@/components/layout/main-section";
import { MissingContentView } from "@/components/MissingContentView";
import { PUB_DEPLOYMENT_BLOCK, PUB_SPP_PRIVATE_ADDRESS, PUB_SPP_PUBLIC_ADDRESS, PUB_TOKEN_SYMBOL } from "@/constants";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { SppProposalCreatedEvent } from "@/plugins/spp/hooks/useSppProposal";
import { useCanCreateProposal as useCanCreatePrivate } from "@/plugins/crispVoting/hooks/useCanCreateProposal";
import { useCanCreateProposal as useCanCreatePublic } from "@/plugins/tokenVoting/hooks/useCanCreateProposal";
import { PrivateRow } from "../components/privateRow";
import { PublicRow } from "../components/publicRow";
import { publicClient } from "../utils/client";
import { STATUS_BUCKETS } from "../utils/statusBucket";

import type { StatusBucket } from "../utils/statusBucket";

type Kind = "private" | "public";
type Entry = { kind: Kind; id: bigint; block: bigint };

const FILTERS: { label: string; value: "all" | Kind }[] = [
  { label: "All", value: "all" },
  { label: "Public", value: "public" },
  { label: "Private", value: "private" },
];

const STATUS_FILTERS: { label: string; value: "all" | StatusBucket }[] = [
  { label: "All", value: "all" },
  ...STATUS_BUCKETS,
];

const entryKey = (e: Entry) => `${e.kind}:${e.id}`;

export default function Proposals() {
  const { isConnected } = useAccount();
  const privateCreate = useCanCreatePrivate();
  const publicCreate = useCanCreatePublic();
  const decimals = useTokenDecimals();
  // A DAO can exist with no voting process yet (the phased mainnet rollout) — say so
  // explicitly instead of a generic empty state, and offer no create button.
  const noVotingPlugins = !isAddress(PUB_SPP_PRIVATE_ADDRESS) && !isAddress(PUB_SPP_PUBLIC_ADDRESS);
  const canCreate = (privateCreate.canCreate || publicCreate.canCreate) && !noVotingPlugins;
  const eligibilityKnown = !privateCreate.isLoading && !publicCreate.isLoading;
  // The lowest configured threshold across the installed processes — the cheapest
  // path to proposing, and the number worth showing an ineligible holder.
  const minPower = [privateCreate.minProposerVotingPower, publicCreate.minProposerVotingPower]
    .filter((v): v is bigint => v !== undefined)
    .reduce<bigint | undefined>((min, v) => (min === undefined || v < min ? v : min), undefined);
  const needsDelegation = privateCreate.needsDelegation || publicCreate.needsDelegation;
  const ineligibleReason = needsDelegation
    ? `You hold ${PUB_TOKEN_SYMBOL} but haven't delegated your voting power. Delegate (even to yourself) to submit proposals.`
    : minPower !== undefined && decimals !== undefined
      ? `Submitting proposals requires at least ${formatUnits(minPower, decimals)} ${PUB_TOKEN_SYMBOL} of delegated voting power.`
      : `Your delegated voting power is below the minimum required to submit proposals.`;
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusBucket>("all");
  // Status lives in the per-row hooks (metadata + tally + SPP state), so rows
  // report it back up here and the list filters on what they resolved.
  const [statuses, setStatuses] = useState<Record<string, StatusBucket | undefined>>({});
  const lastFetchedBlock = useRef<bigint | null>(null);

  const reportStatus = useCallback((key: string, bucket: StatusBucket | undefined) => {
    setStatuses((prev) => (prev[key] === bucket ? prev : { ...prev, [key]: bucket }));
  }, []);

  const fetchProposals = useCallback(async () => {
    if (!publicClient || !blockNumber || !PUB_DEPLOYMENT_BLOCK) return;

    const fromBlock = lastFetchedBlock.current ? lastFetchedBlock.current + 1n : BigInt(PUB_DEPLOYMENT_BLOCK);
    if (lastFetchedBlock.current && fromBlock > blockNumber) return;

    // Proposals now live on the SPP instances (the bodies only hold stage-0 sub-proposals).
    const sources: { kind: Kind; address: `0x${string}`; event: typeof SppProposalCreatedEvent }[] = [];
    if (isAddress(PUB_SPP_PRIVATE_ADDRESS))
      sources.push({ kind: "private", address: PUB_SPP_PRIVATE_ADDRESS, event: SppProposalCreatedEvent });
    if (isAddress(PUB_SPP_PUBLIC_ADDRESS))
      sources.push({ kind: "public", address: PUB_SPP_PUBLIC_ADDRESS, event: SppProposalCreatedEvent });

    try {
      setIsLoading(true);
      const perSource = await Promise.all(
        sources.map(({ kind, address, event }) =>
          publicClient
            .getLogs({ address, event, fromBlock, toBlock: blockNumber })
            .then((logs) =>
              logs
                .map((log) => {
                  const id = (log.args as { proposalId?: bigint })?.proposalId;
                  return id === undefined ? null : ({ kind, id, block: log.blockNumber ?? 0n } as Entry);
                })
                .filter((e): e is Entry => e !== null)
            )
            .catch((err) => {
              console.error(`Could not fetch ${kind} proposals`, err);
              return [] as Entry[];
            })
        )
      );

      lastFetchedBlock.current = blockNumber;
      const fresh = perSource.flat();
      if (fresh.length) {
        setEntries((prev) => {
          const seen = new Set(prev.map((e) => `${e.kind}:${e.id}`));
          const unique = fresh.filter((e) => !seen.has(`${e.kind}:${e.id}`));
          return [...prev, ...unique].sort((a, b) => (b.block > a.block ? 1 : b.block < a.block ? -1 : 0));
        });
      }
    } catch {
      setError("Could not fetch proposals");
    } finally {
      setIsLoading(false);
    }
  }, [blockNumber]);

  useEffect(() => {
    fetchProposals();
  }, [blockNumber, fetchProposals]);

  // Stable per-row reporters so the rows' effects don't re-fire on every render.
  const statusHandlers = useMemo(() => {
    const map: Record<string, (bucket: StatusBucket | undefined) => void> = {};
    for (const e of entries) {
      const key = entryKey(e);
      map[key] = (bucket) => reportStatus(key, bucket);
    }
    return map;
  }, [entries, reportStatus]);

  const visible = entries.filter((e) => kindFilter === "all" || e.kind === kindFilter);
  // Rows stay mounted when filtered out (their hooks are what resolve the status),
  // so "nothing matches" is counted here rather than by an empty render.
  const matchCount = visible.filter((e) => statusFilter === "all" || statuses[entryKey(e)] === statusFilter).length;

  return (
    <MainSection narrow={true}>
      <div className="page-head w-full">
        <div>
          <div className="kicker mb-3">Governance</div>
          <h1 className="display-title">Proposals</h1>
        </div>
        <div className="justify-self-end text-right">
          <If true={isConnected && canCreate}>
            <Then>
              <Link href="#/new">
                <Button iconLeft={IconType.PLUS} size="md" variant="primary">
                  Create proposal
                </Button>
              </Link>
            </Then>
            <Else>
              <If true={isConnected && !noVotingPlugins && eligibilityKnown}>
                <Button iconLeft={IconType.PLUS} size="md" variant="primary" disabled={true}>
                  Create proposal
                </Button>
                <p className="mt-2 max-w-xs text-sm text-neutral-500">{ineligibleReason}</p>
              </If>
            </Else>
          </If>
        </div>
      </div>

      <If not={entries.length}>
        <Then>
          <MissingContentView>
            {noVotingPlugins
              ? "The voting plugins are not installed in this DAO yet. Proposals will appear here once governance goes live."
              : isLoading
                ? "Loading proposals…"
                : error
                  ? error
                  : "No active proposals. Public proposals and private CRISP ballots will appear here when created."}
          </MissingContentView>
        </Then>
        <Else>
          <div className="chip-group-label">Type</div>
          <div className="chips">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={classNames("chip", { on: kindFilter === f.value })}
                onClick={() => setKindFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="chip-group-label mt-3">Status</div>
          <div className="chips">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={classNames("chip", { on: statusFilter === f.value })}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <If not={matchCount}>
            <MissingContentView>No proposals match the selected filters.</MissingContentView>
          </If>
          <div className="proposal-list">
            {visible.map((e) => {
              const key = entryKey(e);
              const hidden = statusFilter !== "all" && statuses[key] !== statusFilter;
              return e.kind === "private" ? (
                <PrivateRow key={key} proposalId={e.id} onStatus={statusHandlers[key]} hidden={hidden} />
              ) : (
                <PublicRow key={key} proposalId={e.id} onStatus={statusHandlers[key]} hidden={hidden} />
              );
            })}
          </div>
        </Else>
      </If>
    </MainSection>
  );
}
