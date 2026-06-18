import { useAccount, useBlockNumber } from "wagmi";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconType } from "@aragon/ods";
import classNames from "classnames";
import Link from "next/link";
import { isAddress } from "viem";
import { Else, If, Then } from "@/components/if";
import { MainSection } from "@/components/layout/main-section";
import { MissingContentView } from "@/components/MissingContentView";
import { PUB_CRISP_VOTING_PLUGIN_ADDRESS, PUB_DEPLOYMENT_BLOCK, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { ProposalCreatedEvent as CrispProposalCreatedEvent } from "@/plugins/crispVoting/hooks/useProposal";
import { ProposalCreatedEvent as TokenProposalCreatedEvent } from "@/plugins/tokenVoting/hooks/useProposal";
import { useCanCreateProposal as useCanCreatePrivate } from "@/plugins/crispVoting/hooks/useCanCreateProposal";
import { useCanCreateProposal as useCanCreatePublic } from "@/plugins/tokenVoting/hooks/useCanCreateProposal";
import { PrivateRow } from "../components/privateRow";
import { PublicRow } from "../components/publicRow";
import { publicClient } from "../utils/client";

type Kind = "private" | "public";
type Entry = { kind: Kind; id: bigint; block: bigint };

const FILTERS: { label: string; value: "all" | Kind }[] = [
  { label: "All", value: "all" },
  { label: "Public", value: "public" },
  { label: "Private", value: "private" },
];

export default function Proposals() {
  const { isConnected } = useAccount();
  const canCreatePrivate = useCanCreatePrivate();
  const canCreatePublic = useCanCreatePublic();
  const canCreate = canCreatePrivate || canCreatePublic;
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const lastFetchedBlock = useRef<bigint | null>(null);

  const fetchProposals = useCallback(async () => {
    if (!publicClient || !blockNumber || !PUB_DEPLOYMENT_BLOCK) return;

    const fromBlock = lastFetchedBlock.current ? lastFetchedBlock.current + 1n : BigInt(PUB_DEPLOYMENT_BLOCK);
    if (lastFetchedBlock.current && fromBlock > blockNumber) return;

    const sources: { kind: Kind; address: `0x${string}`; event: typeof CrispProposalCreatedEvent }[] = [];
    if (isAddress(PUB_CRISP_VOTING_PLUGIN_ADDRESS))
      sources.push({ kind: "private", address: PUB_CRISP_VOTING_PLUGIN_ADDRESS, event: CrispProposalCreatedEvent });
    if (isAddress(PUB_TOKEN_VOTING_PLUGIN_ADDRESS))
      sources.push({ kind: "public", address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS, event: TokenProposalCreatedEvent });

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

  const visible = entries.filter((e) => kindFilter === "all" || e.kind === kindFilter);

  return (
    <MainSection narrow={true}>
      <div className="page-head w-full">
        <div>
          <div className="kicker mb-3">02 · Governance</div>
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
          <div className="proposal-list">
            {visible.map((e) =>
              e.kind === "private" ? (
                <PrivateRow key={`private:${e.id}`} proposalId={e.id} />
              ) : (
                <PublicRow key={`public:${e.id}`} proposalId={e.id} />
              )
            )}
          </div>
        </Else>
      </If>
    </MainSection>
  );
}
