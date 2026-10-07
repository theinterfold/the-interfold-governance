import { Disclosure } from "@/components/motion/Disclosure";
import { PanelHeader } from "@/components/panelHeader";
import { SearchField } from "@/components/input/searchField";
import styles from "./proposalList.module.css";
import { NativeSelect } from "@/components/input/nativeSelect";
import { useAccount, useBlockNumber } from "wagmi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionLink } from "@/components/input/actionLink";
import { formatUnits, isAddress } from "viem";
import { Else, If, Then } from "@/components/if";
import { MissingContentView } from "@/components/MissingContentView";
import { PageIntro } from "@/components/pageIntro";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { PUB_DEPLOYMENT_BLOCK, PUB_SPP_PRIVATE_ADDRESS, PUB_SPP_PUBLIC_ADDRESS, PUB_TOKEN_SYMBOL } from "@/constants";
// Aliased: this file already has a local `fetchProposals` callback.
import { fetchProposals as fetchProposalsFromServer } from "@/utils/crispIndexer";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { SppProposalCreatedEvent } from "@/plugins/spp/hooks/useSppProposal";
import { useCanCreateProposal as useCanCreatePrivate } from "@/plugins/crispVoting/hooks/useCanCreateProposal";
import { useCanCreateProposal as useCanCreatePublic } from "@/plugins/tokenVoting/hooks/useCanCreateProposal";
import { PrivateRow } from "../components/privateRow";
import { PublicRow } from "../components/publicRow";
import { publicClient } from "../utils/client";
import { STATUS_BUCKETS, matchesStatusFilter } from "../utils/statusBucket";

import type { StatusBucket, StatusFilter } from "../utils/statusBucket";

type Kind = "private" | "public";
type Entry = { kind: Kind; id: bigint; block: bigint };

const FILTERS: { label: string; value: "all" | Kind }[] = [
  { label: "All voting methods", value: "all" },
  { label: "Secret ballot", value: "private" },
  { label: "Transparent fallback", value: "public" },
];

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All statuses", value: "all" },
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
  const bondedAway = !!(privateCreate.bondedDelegate ?? publicCreate.bondedDelegate);
  const ineligibleReason = needsDelegation
    ? `You hold ${PUB_TOKEN_SYMBOL}, but your voting power is not active. Delegate to yourself to submit proposals.`
    : bondedAway
      ? "Your bonded voting power votes through a delegate. To use it yourself, stop the delegation on the Voting power page."
      : minPower !== undefined && decimals !== undefined
        ? `Submitting proposals requires at least ${formatUnits(minPower, decimals)} ${PUB_TOKEN_SYMBOL} of delegated voting power.`
        : `Your delegated voting power is below the minimum required to submit proposals.`;
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [searchTexts, setSearchTexts] = useState<Record<string, string>>({});
  // Status lives in the per-row hooks (metadata + tally + SPP state), so rows
  // report it back up here and the list filters on what they resolved.
  const [statuses, setStatuses] = useState<Record<string, StatusBucket | undefined>>({});
  // Each processor advances only after its own read succeeds. A failed public scan
  // must not cause the next block to skip public proposals while private succeeds.
  const lastFetchedBlock = useRef<Partial<Record<Kind, bigint>>>({});

  const reportStatus = useCallback((key: string, bucket: StatusBucket | undefined) => {
    setStatuses((prev) => (prev[key] === bucket ? prev : { ...prev, [key]: bucket }));
  }, []);

  const reportSearchText = useCallback((key: string, text: string) => {
    setSearchTexts((prev) => (prev[key] === text ? prev : { ...prev, [key]: text }));
  }, []);

  const fetchProposals = useCallback(async () => {
    if (!blockNumber || !PUB_DEPLOYMENT_BLOCK) return;

    // Proposals now live on the SPP instances (the bodies only hold stage-0 sub-proposals).
    const sources: { kind: Kind; address: `0x${string}`; event: typeof SppProposalCreatedEvent }[] = [];
    if (isAddress(PUB_SPP_PRIVATE_ADDRESS))
      sources.push({ kind: "private", address: PUB_SPP_PRIVATE_ADDRESS, event: SppProposalCreatedEvent });
    if (isAddress(PUB_SPP_PUBLIC_ADDRESS))
      sources.push({ kind: "public", address: PUB_SPP_PUBLIC_ADDRESS, event: SppProposalCreatedEvent });

    try {
      setIsLoading(true);
      const perSource = await Promise.allSettled(
        sources.map(async ({ kind, address, event }) => {
          const lastBlock = lastFetchedBlock.current[kind];
          const fromBlock = lastBlock === undefined ? BigInt(PUB_DEPLOYMENT_BLOCK) : lastBlock + 1n;
          if (fromBlock > blockNumber) return [] as Entry[];
          // One request per SPP instead of a log walk each, and the answer is the whole list
          // rather than a delta — so the incremental `fromBlock` bookkeeping is bypassed.
          const fromServer = await fetchProposalsFromServer({ plugin: address, fromBlock: PUB_DEPLOYMENT_BLOCK });
          if (fromServer) {
            return fromServer.map(
              (proposal) => ({ kind, id: BigInt(proposal.proposal_id), block: BigInt(proposal.block) }) as Entry
            );
          }

          if (!publicClient) throw new Error("Proposal RPC is unavailable");
          const logs = await publicClient.getLogs({ address, event, fromBlock, toBlock: blockNumber });
          return logs
            .map((log) => {
              const id = (log.args as { proposalId?: bigint })?.proposalId;
              return id === undefined ? null : ({ kind, id, block: log.blockNumber ?? 0n } as Entry);
            })
            .filter((e): e is Entry => e !== null);
        })
      );

      const fresh: Entry[] = [];
      let failed = false;
      perSource.forEach((result, index) => {
        const kind = sources[index].kind;
        if (result.status === "rejected") {
          failed = true;
          console.error(`Could not fetch ${kind} proposals`, result.reason);
          return;
        }
        const prior = lastFetchedBlock.current[kind];
        if (prior === undefined || blockNumber > prior) lastFetchedBlock.current[kind] = blockNumber;
        fresh.push(...result.value);
      });
      setError(failed ? "Some proposals could not be loaded." : null);
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
  }, [blockNumber, retryKey]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  // Stable per-row reporters so the rows' effects don't re-fire on every render.
  const rowHandlers = useMemo(() => {
    const map: Record<
      string,
      { onStatus: (bucket: StatusBucket | undefined) => void; onSearchText: (text: string) => void }
    > = {};
    for (const e of entries) {
      const key = entryKey(e);
      map[key] = {
        onStatus: (bucket) => reportStatus(key, bucket),
        onSearchText: (text) => reportSearchText(key, text),
      };
    }
    return map;
  }, [entries, reportStatus, reportSearchText]);

  const searchTerm = search.trim().toLowerCase();
  const matches = (e: Entry) =>
    (kindFilter === "all" || e.kind === kindFilter) &&
    matchesStatusFilter(statuses[entryKey(e)], statusFilter) &&
    (!searchTerm || `${e.id} ${searchTexts[entryKey(e)] ?? ""}`.toLowerCase().includes(searchTerm));
  const matchCount = entries.filter(matches).length;
  const resolving = entries.some((e) => searchTexts[entryKey(e)] === undefined);
  const hasFilters = kindFilter !== "all" || statusFilter !== "all" || !!searchTerm;
  const clearFilters = () => {
    setKindFilter("all");
    setStatusFilter("all");
    setSearch("");
  };
  const retryLoad = () => setRetryKey((key) => key + 1);
  const showCreate = isConnected && (canCreate || (!noVotingPlugins && eligibilityKnown));

  return (
    <div className="proposals-page">
      <PageIntro
        title="Proposals"
        glyph="proposals"
        description="Explore the decisions shaping Interfold. Read proposals, cast your vote, and follow the outcome."
      />
      <section aria-labelledby="proposal-list-heading">
        <PanelHeader
          id="proposal-list-heading"
          title="Governance activity"
          description="Open a proposal to vote or review its results."
          className={styles.heading}
          action={
            showCreate && (
              <div className={styles.create}>
                <>
                  <ActionLink
                    href="#/new"
                    intent="create"
                    affordance="plus"
                    disabled={!canCreate}
                    aria-describedby={!canCreate ? "proposal-create-requirement" : undefined}
                  >
                    Create proposal
                  </ActionLink>
                  {!canCreate && (
                    <p id="proposal-create-requirement" className="ui-body">
                      {ineligibleReason}
                    </p>
                  )}
                </>
              </div>
            )
          }
        />
        <ScrollFadeIn amount="some" className={`ui-panel ${styles.panel}`}>
          <If not={entries.length}>
            <Then>
              <div className={styles.feedback}>
                <MissingContentView>
                  {noVotingPlugins
                    ? "The voting plugins are not installed in this DAO yet. Proposals will appear here once governance goes live."
                    : isLoading
                      ? "Loading proposals…"
                      : error
                        ? error
                        : "No active proposals. Secret-ballot proposals and transparent fallback proposals will appear here when created."}
                </MissingContentView>
                {error && (
                  <button type="button" className="ui-text-action" onClick={retryLoad}>
                    Try again
                  </button>
                )}
              </div>
            </Then>
            <Else>
              {error && (
                <div className={styles.feedback} role="alert">
                  <p className="ui-body">{error}</p>
                  <button type="button" className="ui-text-action" onClick={retryLoad}>
                    Try again
                  </button>
                </div>
              )}
              <div className="proposal-toolbar" role="search" aria-label="Filter proposals">
                <SearchField
                  className="proposal-search"
                  label="Search"
                  placeholder="Title, proposer or proposal ID"
                  value={search}
                  onChange={setSearch}
                />
                <label className="proposal-filter">
                  <span>Status</span>
                  <NativeSelect
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  >
                    {STATUS_FILTERS.map((filter) => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className="proposal-filter">
                  <span>Voting method</span>
                  <NativeSelect
                    value={kindFilter}
                    onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}
                  >
                    {FILTERS.map((filter) => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              </div>
              <div className="proposal-list-caption">
                <p role="status">
                  {matchCount} {matchCount === 1 ? "proposal" : "proposals"}
                  {hasFilters ? ` of ${entries.length}` : ""}
                </p>
                <div>
                  {hasFilters && (
                    <button type="button" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )}
                  <span>Newest first</span>
                </div>
              </div>
              <Disclosure open={!matchCount}>
                <div className={styles.feedback}>
                  <MissingContentView>
                    {resolving
                      ? "Checking proposals…"
                      : hasFilters
                        ? "No proposals match your search and filters."
                        : "No proposals to show."}
                  </MissingContentView>
                </div>
              </Disclosure>
              <div className="proposal-list">
                {entries.map((e) => {
                  const key = entryKey(e);
                  const hidden = !matches(e);
                  return (
                    <Disclosure key={key} open={!hidden} className="proposal-filter-row">
                      {e.kind === "private" ? (
                        <PrivateRow proposalId={e.id} {...rowHandlers[key]} />
                      ) : (
                        <PublicRow proposalId={e.id} {...rowHandlers[key]} />
                      )}
                    </Disclosure>
                  );
                })}
              </div>
            </Else>
          </If>
        </ScrollFadeIn>
      </section>
    </div>
  );
}
