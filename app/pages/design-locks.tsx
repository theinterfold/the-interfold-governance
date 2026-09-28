import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useMemo, useState } from "react";
import { LockPanelExploration } from "@/dev/lockPanelExploration";
import { ActionButton } from "@/components/input/actionButton";
import { PowerDisclosure } from "@/plugins/velocker/components/powerDisclosure";
import {
  LockReviewPanel,
  PreviewBar,
  PreviewRows,
  amount,
  states,
  type PreviewLock,
  type Variant,
  type BalanceLayout,
  type StateTreatment,
} from "@/dev/lockReviewPanel";
import styles from "@/dev/lockBarReview.module.css";

// Comparison only: never published, connected to wallet balances, or used to send transactions.
type ReviewProps = { referenceTimestamp: number };
export const getServerSideProps: GetServerSideProps<ReviewProps> = async () =>
  process.env.NODE_ENV === "development"
    ? { props: { referenceTimestamp: Math.floor(Date.now() / 1000) } }
    : { notFound: true };

const stateTreatments: { id: StateTreatment; title: string; description: string }[] = [
  {
    id: "reference",
    title: "Referência guardada",
    description: "A versão anterior: ícones no resumo e badges de texto na lista. Mantida para comparação.",
  },
  {
    id: "icons",
    title: "1 · Ícones a cores",
    description: "Cor apenas no ícone do resumo; o mesmo ícone acompanha o estado na lista.",
  },
  {
    id: "bubbles",
    title: "2 · Ícones em círculos",
    description: "Círculos com as cores dos estados; os ícones mantêm-se ao abrir a lista.",
  },
  {
    id: "badges",
    title: "3 · Badges de estado",
    description: "A mesma forma, cor e ícone no resumo e na lista. O resumo acrescenta a contagem.",
  },
];
const base: PreviewLock[] = [
  { id: "2", amount: 10000, status: "active" },
  { id: "5", amount: 125000, status: "active" },
  { id: "1", amount: 15000, status: "cooldown", days: 12 },
  { id: "4", amount: 2500, status: "cooldown", days: 26 },
];
const scenarios: { label: string; locks: PreviewLock[] }[] = [
  { label: "4 locks", locks: base },
  { label: "1 lock", locks: [base[0]] },
  {
    label: "Todos os estados",
    locks: base.map((lock, index) => ({ ...lock, status: states[index] })),
  },
  {
    label: "12 locks",
    locks: Array.from({ length: 12 }, (_, index) => ({
      id: String(index + 1),
      amount: (index + 1) * 2500,
      status: states[index % states.length],
      days: index + 2,
    })),
  },
  { label: "Sem locks", locks: [] },
];
const variants: { id: Variant; title: string; description: string }[] = [
  {
    id: "a",
    title: "Contagem + marcadores",
    description: "Cada quadrado é um lock. Os estados aparecem ao passar o cursor.",
  },
  { id: "b", title: "Estados à vista", description: "Quantos locks estão em cada estado, sem depender do hover." },
  {
    id: "c",
    title: "Valores por estado",
    description: "Mostra onde está o FOLD. A faixa representa valores, não contagens.",
  },
  {
    id: "d",
    title: "Prévia dos locks",
    description: "Identificação, valor e estado de dois locks, antes de abrir a lista.",
  },
];
const balanceLayouts: { id: BalanceLayout; title: string; description: string }[] = [
  { id: "original", title: "B · Original", description: "Saldo acima da ação; estados numa segunda linha." },
  {
    id: "inline",
    title: "B1 · Estados em linha",
    description: "Os estados ficam ao lado de View locks e passam de linha apenas quando precisam de espaço.",
  },
  {
    id: "paired",
    title: "B2 · Saldo + ação",
    description: "Cada dupla tem um contorno comum: Unlocked FOLD + Lock FOLD e Locked FOLD + View locks.",
  },
  {
    id: "hierarchy",
    title: "B3 · Posição, ação e detalhe",
    description:
      "Locked FOLD mostra a posição atual. Unlocked FOLD e Lock FOLD ficam juntos. Quando há locks, os estados ficam à direita na barra que abre o detalhe.",
  },
];

export default function LockBarReview({ referenceTimestamp }: ReviewProps) {
  const [scenario, setScenario] = useState(0);
  const [study, setStudy] = useState<"new" | "previous">("new");
  const [fullPanel, setFullPanel] = useState(true);
  const [selected, setSelected] = useState<Variant>("b");
  const [balanceLayout, setBalanceLayout] = useState<BalanceLayout>("hierarchy");
  const [stateTreatment, setStateTreatment] = useState<StateTreatment>("icons");
  const comparingStates = selected === "b" && balanceLayout === "hierarchy";
  // One reference per page keeps the sample end dates stable across all comparisons.
  const locks = useMemo(
    () =>
      scenarios[scenario].locks.map((lock) => ({
        ...lock,
        cooldown:
          lock.status === "cooldown"
            ? {
                endsAt: referenceTimestamp + (lock.days ?? 12) * 86400,
                observedAt: referenceTimestamp,
              }
            : undefined,
      })),
    [scenario, referenceTimestamp]
  );
  const selectedVariant = variants.find((variant) => variant.id === selected)!;
  return (
    <main className={styles.review} data-mode={fullPanel ? "full" : "compact"}>
      <Head>
        <title>Painéis de voting power · Interfold</title>
      </Head>
      <header className={styles.header}>
        <span className="ui-label">Estudo de interface · dados de exemplo</span>
        <h1>
          {study === "new"
            ? "Voting power e gestão de locks."
            : fullPanel
              ? "Saldo, estados e ações."
              : "Uma barra, quatro níveis de informação."}
        </h1>
        <div className={styles.viewMode}>
          <p>
            {study === "new"
              ? "Comparar a visão da conta e a gestão dos locks em dois blocos."
              : fullPanel
                ? "Explorar a hierarquia entre saldos, ação e detalhe."
                : "Abre as barras para comparar a mesma lista e a mesma animação."}
          </p>
          <div className={styles.variantControls}>
            <button
              type="button"
              onClick={() => {
                setStudy(study === "new" ? "previous" : "new");
                setFullPanel(true);
              }}
            >
              {study === "new" ? "Ver estudos anteriores" : "Ver novas composições"}
            </button>
            {study === "previous" && (
              <button type="button" onClick={() => setFullPanel(!fullPanel)}>
                {fullPanel ? "Comparar só as barras" : "Ver painel completo"}
              </button>
            )}
          </div>
        </div>
        <div className={styles.controls} role="group" aria-label="Cenário de comparação">
          {scenarios.map((item, index) => (
            <ActionButton
              key={item.label}
              intent={index === scenario ? "confirm" : "open"}
              aria-pressed={index === scenario}
              onClick={() => setScenario(index)}
            >
              {item.label}
            </ActionButton>
          ))}
        </div>
      </header>
      {study === "new" ? (
        <LockPanelExploration initialLocks={locks} />
      ) : fullPanel ? (
        <section aria-label="Comparação no painel completo">
          <div className={styles.variantControls} role="group" aria-label="Opção da barra">
            {variants.map((variant) => (
              <ActionButton
                key={variant.id}
                intent={selected === variant.id ? "confirm" : "open"}
                aria-pressed={selected === variant.id}
                onClick={() => setSelected(variant.id)}
              >
                {variant.id.toUpperCase()} · {variant.title}
              </ActionButton>
            ))}
          </div>
          {selected === "b" && (
            <div
              className={`${styles.variantControls} ${styles.refinements}`}
              role="group"
              aria-label="Organização do saldo e da ação"
            >
              {balanceLayouts.map((layout) => (
                <ActionButton
                  key={layout.id}
                  intent={balanceLayout === layout.id ? "confirm" : "open"}
                  aria-pressed={balanceLayout === layout.id}
                  onClick={() => setBalanceLayout(layout.id)}
                >
                  {layout.title}
                </ActionButton>
              ))}
            </div>
          )}
          <p className={styles.variantDescription}>
            {selected === "b"
              ? balanceLayouts.find((layout) => layout.id === balanceLayout)!.description
              : selectedVariant.description}
          </p>
          {comparingStates && (
            <fieldset className={styles.stateComparison}>
              <legend>Cor e ícones dos estados · B3</legend>
              <div className={styles.variantControls}>
                {stateTreatments.map((treatment) => (
                  <ActionButton
                    key={treatment.id}
                    intent={stateTreatment === treatment.id ? "confirm" : "open"}
                    aria-pressed={stateTreatment === treatment.id}
                    onClick={() => setStateTreatment(treatment.id)}
                  >
                    {treatment.title}
                  </ActionButton>
                ))}
              </div>
              <p>{stateTreatments.find((treatment) => treatment.id === stateTreatment)!.description}</p>
            </fieldset>
          )}
          <LockReviewPanel
            key={`${scenario}-${selected}-${balanceLayout}`}
            locks={locks}
            variant={selected}
            layout={balanceLayout}
            stateTreatment={comparingStates ? stateTreatment : "reference"}
          />
        </section>
      ) : (
        <div className={styles.grid}>
          {variants.map((variant) => (
            <article className={styles.option} key={variant.id} aria-labelledby={`variant-${variant.id}`}>
              <header className={styles.optionHeading}>
                <span>{variant.id.toUpperCase()}</span>
                <div>
                  <h2 id={`variant-${variant.id}`}>{variant.title}</h2>
                  <p>{variant.description}</p>
                </div>
              </header>
              <div className={styles.sample}>
                <dl className="fold-balance-metric fold-balance-locked">
                  <dt>Locked FOLD</dt>
                  <dd>
                    {amount(locks.reduce((sum, lock) => sum + lock.amount, 0))} <span>FOLD</span>
                  </dd>
                </dl>
                <PowerDisclosure
                  key={scenario}
                  className={styles.disclosure}
                  title={`Locks · option ${variant.id.toUpperCase()}`}
                  renderHeading={(toggle) => toggle}
                  renderToggle={(props) => <PreviewBar {...props} variant={variant.id} locks={locks} />}
                >
                  <PreviewRows locks={locks} />
                </PowerDisclosure>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
