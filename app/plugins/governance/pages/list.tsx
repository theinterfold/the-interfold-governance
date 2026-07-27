import { useAccount, useBlockNumber } from "wagmi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconType } from "@aragon/ods";
import classNames from "classnames";
import Link from "next/link";
import { isAddress } from "viem";
import { Else, If, Then } from "@/components/if";
import { MainSection } from "@/components/layout/main-section";
import { MissingContentView } from "@/components/MissingContentView";
import { PUB_DEPLOYMENT_BLOCK, PUB_SPP_PRIVATE_ADDRESS, PUB_SPP_PUBLIC_ADDRESS } from "@/constants";
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
  const { canCreate: canCreatePrivate } = useCanCreatePrivate();
  const canCreatePublic = useCanCreatePublic();
  const canCreate = canCreatePrivate || canCreatePublic;
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
        <div className="justify-self-end">
          <If true={isConnected && canCreate}>
            <Link href="#/new">
              <Button iconLeft={IconType.PLUS} size="md" variant="primary">
                Submit Proposal
              </Button>
            </Link>
          </If>
        </div>
      </div>

      <If not={entries.length}>
        <Then>
          <MissingContentView>
            {isLoading
              ? "Loading proposals…"
              : error
                ? error
                : "No proposals have been created yet. Public and private proposals will both appear here."}
          </MissingContentView>
        </Then>
        <Else>
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
          <div className="chips mt-2">
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
