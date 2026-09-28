import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { parseUnits, zeroAddress, type Address } from "viem";
import { ActionButton } from "@/components/input/actionButton";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import {
  FoldAccountSummary,
  FoldBalanceMetric,
  LockManagementSummary,
} from "@/plugins/velocker/components/foldBalanceSummary";
import { FoldBalanceBreakdown } from "@/plugins/velocker/components/foldBalanceBreakdown";
import { FoldBalanceInfo } from "@/plugins/velocker/components/foldBalanceInfo";
import { VotingPowerInfo } from "@/plugins/velocker/components/votingPowerInfo";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { PowerDisclosure } from "@/plugins/velocker/components/powerDisclosure";
import { LockSummaryToggle } from "@/plugins/velocker/components/lockSummaryToggle";
import type { AllocationKind, FoldAllocation } from "@/plugins/velocker/utils/foldAllocation";
import { LockReviewFormAction } from "./lockReviewForm";
import { DEMO_WALLET } from "./previewMode";
import { PreviewRows, amount, type PreviewLock } from "./lockReviewPanel";
import styles from "./lockPanelExploration.module.css";

type Composition = "cards" | "contained" | "essential" | "divided" | "compact" | "current";
const options: { id: Composition; label: string; description: string }[] = [
  {
    id: "cards",
    label: "N1 · Dois cartões",
    description: "Voting power no topo esquerdo, composição do saldo à direita e locks sempre visíveis abaixo.",
  },
  {
    id: "contained",
    label: "N1b · Cabeçalhos dentro",
    description: "A composição do N1, com títulos, introduções e a ação Lock FOLD dentro dos respetivos cartões.",
  },
  {
    id: "essential",
    label: "N1c · Só o essencial",
    description: "A explicação do voting power no canto inferior, sem ligação às propostas nem introdução nos locks.",
  },
  {
    id: "divided",
    label: "N2 · Painel dividido",
    description: "A mesma separação em duas colunas, dentro de um único painel.",
  },
  {
    id: "compact",
    label: "N3 · Resumo compacto",
    description: "Dois cartões sem o gráfico permanente. A composição completa fica no i do Total FOLD.",
  },
  {
    id: "current",
    label: "Atual · Painel único",
    description: "A versão atual, guardada para comparar com as novas composições.",
  },
];
const account: Address = DEMO_WALLET;
const initialDelegate: Address = "0x00000000000000000000000000000000000000bb";
const allocationKinds = { active: "delegated", inactive: "undelegated", cooldown: "cooldown", ready: "ready" } as const;

/** A local comparison: the modal changes only these sample balances, never a wallet. */
export function LockPanelExploration({ initialLocks }: { initialLocks: PreviewLock[] }) {
  const [composition, setComposition] = useState<Composition>("essential");
  const essential = composition === "essential";
  const contained = composition === "contained" || essential;
  const [locks, setLocks] = useState(initialLocks);
  const [unlockedAmount, setUnlockedAmount] = useState(2500);
  const [delegate, setDelegate] = useState<Address>(initialDelegate);
  const [revision, setRevision] = useState(0);
  const allocationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLocks(initialLocks);
    setUnlockedAmount(2500);
    setDelegate(initialDelegate);
    setRevision((value) => value + 1);
  }, [initialLocks]);
  const decimals = useTokenDecimals();
  const tokens = (value: number) => (decimals === undefined ? undefined : parseUnits(String(value), decimals));
  const lockedAmount = locks.reduce((sum, lock) => sum + lock.amount, 0);
  const selfDelegated = delegate.toLowerCase() === account.toLowerCase();
  const activeAmount = locks.filter((lock) => lock.status === "active").reduce((sum, lock) => sum + lock.amount, 0);
  const selfDelegatedAmount = selfDelegated ? activeAmount : 0;
  const parts: { kind: AllocationKind; amount: bigint }[] =
    decimals === undefined
      ? []
      : [
          { kind: "wallet", amount: tokens(unlockedAmount)! },
          ...locks.map((lock) => ({
            kind: lock.status === "active" && selfDelegated ? ("self" as const) : allocationKinds[lock.status],
            amount: tokens(lock.amount)!,
          })),
          { kind: "bonded", amount: tokens(10000)! },
          { kind: "vesting", amount: tokens(15000)! },
        ];
  // Multiple locks can share an allocation kind; both chart modes expect one segment per kind.
  const grouped = new Map<AllocationKind, bigint>();
  for (const part of parts) grouped.set(part.kind, (grouped.get(part.kind) ?? 0n) + part.amount);
  const allocation: FoldAllocation =
    decimals === undefined
      ? { status: "unavailable" }
      : {
          status: "ready",
          total: parts.reduce((sum, part) => sum + part.amount, 0n),
          parts: [...grouped].filter(([, value]) => value > 0n).map(([kind, value]) => ({ kind, amount: value })),
        };
  useEffect(() => {
    const container = allocationRef.current;
    const legend = container?.querySelector<HTMLElement>(".fold-allocation-legend");
    if (!container || !legend) return;
    // The legend's natural height determines the chart diameter, including after reflow.
    const measure = () => {
      const height = legend.getBoundingClientRect().height;
      if (height > 0) container.style.setProperty("--allocation-diameter", `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(legend);
    return () => observer.disconnect();
  }, [composition, allocation.status]);
  const reset = () => {
    setLocks(initialLocks);
    setUnlockedAmount(2500);
    setDelegate(initialDelegate);
    setRevision((value) => value + 1);
  };
  const votingPower = (
    <dl className="power-metric-total" aria-label="Your voting power">
      <dt>
        {contained ? "Your voting power" : "Voting power"}{" "}
        {contained ? (
          <PowerInfo label="About your voting power" compact={true}>
            <p>Locks delegated to another wallet are excluded from your voting power.</p>
            <p>Proposals use the voting power recorded at their snapshot.</p>
          </PowerInfo>
        ) : (
          <VotingPowerInfo
            breakdown={{
              available: decimals !== undefined,
              lockedAndDelegated: tokens(selfDelegatedAmount),
              bonded: tokens(10000),
              vesting: tokens(15000),
            }}
          />
        )}
      </dt>
      <dd>
        {amount(25000 + selfDelegatedAmount)}
        <span>FOLD</span>
      </dd>
    </dl>
  );
  const lockAction = (
    <LockReviewFormAction
      key={revision}
      account={account}
      currentDelegate={delegate}
      balance={unlockedAmount}
      locksAmount={locks
        .filter((lock) => lock.status === "active" || lock.status === "inactive")
        .reduce((sum, lock) => sum + lock.amount, 0)}
      onCreated={({ amount: value, owner }) => {
        setUnlockedAmount((balance) => balance - value);
        if (owner.toLowerCase() === account.toLowerCase())
          setLocks((previous) => [
            ...previous,
            {
              id: String(Math.max(0, ...previous.map((lock) => Number(lock.id))) + 1),
              amount: value,
              status: delegate === zeroAddress ? "inactive" : "active",
            },
          ]);
      }}
      onDelegate={(target) => {
        setDelegate(target);
        setLocks((previous) =>
          previous.map((lock) =>
            lock.status === "active" || lock.status === "inactive"
              ? { ...lock, status: target === zeroAddress ? "inactive" : "active" }
              : lock
          )
        );
      }}
    />
  );
  const isCurrent = composition === "current";
  const disclosure = (
    <PowerDisclosure
      key={`${composition}-${revision}`}
      className={
        isCurrent ? "power-lock-disclosure power-account-disclosure" : `power-lock-disclosure ${styles.lockDisclosure}`
      }
      title="FOLD locks"
      renderHeading={(toggle) =>
        isCurrent ? (
          <FoldAccountSummary
            votingPower={votingPower}
            allocation={allocation}
            locked={tokens(lockedAmount)}
            unlocked={tokens(unlockedAmount)}
            createAction={lockAction}
            detailAction={locks.length ? toggle : undefined}
          />
        ) : (
          <LockManagementSummary
            locked={tokens(lockedAmount)}
            unlocked={tokens(unlockedAmount)}
            createAction={lockAction}
            detailAction={locks.length ? toggle : undefined}
          />
        )
      }
      renderToggle={(props) => (
        <LockSummaryToggle {...props} items={locks.map((lock) => ({ id: `lock-${lock.id}`, status: lock.status }))} />
      )}
    >
      <PreviewRows locks={locks} showIcons={true} />
    </PowerDisclosure>
  );
  return (
    <section className={styles.exploration} aria-label="Novas composições do painel">
      <div className={styles.toolbar}>
        <div className={styles.options} role="group" aria-label="Composição do painel">
          {options.map((option) => (
            <ActionButton
              key={option.id}
              intent={composition === option.id ? "confirm" : "open"}
              aria-pressed={composition === option.id}
              onClick={() => setComposition(option.id)}
            >
              {option.label}
            </ActionButton>
          ))}
        </div>
        <button type="button" className={styles.reset} onClick={reset}>
          Repor exemplo
        </button>
      </div>
      <p className={styles.description}>{options.find((option) => option.id === composition)!.description}</p>
      {composition === "cards" || contained ? (
        <div className={styles.blocks} data-composition="cards" data-contained={contained} data-essential={essential}>
          <section
            className={`${styles.previewSection}${contained ? ` power-card ${styles.containedCard}` : ""}`}
            aria-label="Account overview"
          >
            <header className={styles.sectionHeading}>
              <div>
                <h2>Your account</h2>
                {!contained && <p>Voting power and token balances.</p>}
              </div>
            </header>
            <div className={`${contained ? "" : "power-card "}${styles.overview}`}>
              <div className={styles.votingSummary}>
                {votingPower}
                <p>
                  {contained
                    ? "From active locks delegated to you, bonded and vesting FOLD."
                    : "Active locks delegated to this wallet, plus bonded and vesting FOLD."}
                </p>
                {contained && !essential && (
                  <Link href="/plugins/proposals/#/" className={styles.proposalsLink}>
                    View proposals <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                )}
              </div>
              <div ref={allocationRef} className={styles.allocation} aria-label="Balance composition">
                <div className={styles.allocationHeading}>
                  <h3>FOLD balance</h3>
                  {!contained && <p>Includes wallet funds, governance locks, bonds and vesting.</p>}
                </div>
                <FoldBalanceBreakdown allocation={allocation} grouped={true} interactive={true} />
              </div>
            </div>
          </section>
          <section
            className={`${styles.previewSection}${contained ? ` power-card ${styles.containedCard} ${styles.locksPanel}` : ""}`}
            aria-label="Lock management"
          >
            <header className={`${styles.sectionHeading}${contained ? ` ${styles.locksHeading}` : ""}`}>
              <div>
                <h2>
                  Locks{" "}
                  <span
                    className={styles.lockCount}
                    aria-label={`${locks.length} ${locks.length === 1 ? "lock" : "locks"}`}
                  >
                    {locks.length}
                  </span>
                </h2>
                {!essential && (
                  <p>
                    {contained
                      ? "30-day withdrawal cooldown."
                      : "Active, delegated locks carry voting power. Withdrawals have a 30-day cooldown."}
                  </p>
                )}
              </div>
              {lockAction}
            </header>
            <div className={`${contained ? "" : "power-card "}${styles.lockCard} ${styles.visibleLocks}`}>
              {locks.length ? (
                <PreviewRows locks={locks} showIcons={true} />
              ) : (
                <p className={styles.emptyLocks}>No locks yet.</p>
              )}
            </div>
          </section>
        </div>
      ) : isCurrent ? (
        <div className="power-card power-overview-card">{disclosure}</div>
      ) : (
        <div className={styles.blocks} data-composition={composition}>
          <section className={`power-card ${styles.overview}`} aria-label="Account overview">
            {votingPower}
            <div className={styles.total}>
              <FoldBalanceMetric
                label="Total FOLD"
                kind="total"
                value={allocation.status === "ready" ? allocation.total : undefined}
                info={<FoldBalanceInfo allocation={allocation} />}
              />
              {composition !== "compact" && (
                <div className={styles.chart} aria-label="Balance composition">
                  <FoldBalanceBreakdown allocation={allocation} grouped={true} showLegend={false} />
                </div>
              )}
            </div>
          </section>
          <section className={`power-card ${styles.lockCard}`} aria-label="Lock management">
            {disclosure}
          </section>
        </div>
      )}
      {!contained && <p className={styles.caption}>Lock FOLD abre o modal e atualiza apenas estes dados de exemplo.</p>}
    </section>
  );
}
