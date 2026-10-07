import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CaretRight, CodeBlock, Eye } from "@phosphor-icons/react";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { PUB_CHAIN } from "@/constants";
import { ActionButton } from "@/components/input/actionButton";
import { SigningSteps, SignatureData, SignatureReviewEntryContent } from "@/dev/signingExploration";
import styles from "@/dev/signatureOptions.module.css";

type Scenario = { id: string; title: string; includeVote: boolean; switchWallet: boolean; includeMask: boolean; steps: number };
const scenarios: Scenario[] = [
  { id: "vote", title: "Só voto", includeVote: true, switchWallet: false, includeMask: false, steps: 1 },
  { id: "vote-mask", title: "Voto + máscara", includeVote: true, switchWallet: false, includeMask: true, steps: 2 },
  { id: "vote-wallet", title: "Voto por outra wallet", includeVote: true, switchWallet: true, includeMask: false, steps: 3 },
  { id: "vote-wallet-mask", title: "Voto + máscara por outra wallet", includeVote: true, switchWallet: true, includeMask: true, steps: 4 },
  { id: "mask", title: "Só máscara", includeVote: false, switchWallet: false, includeMask: true, steps: 1 },
];
type EntryStyle = "verb" | "view" | "hint" | "chevron" | "view-eye" | "inspector" | "tech-caps" | "tech-format" | "tech-fields" | "closed-fill" | "closed-line" | "closed-dash";
const entryOptions: { id: EntryStyle; title: string }[] = [
  { id: "closed-fill", title: "F1. Superfície neutra" },
  { id: "closed-line", title: "F2. Contorno fino" },
  { id: "closed-dash", title: "F3. Contorno técnico" },
  { id: "tech-caps", title: "T1. ALL CAPS pequeno" },
  { id: "tech-format", title: "T2. Formato em destaque" },
  { id: "tech-fields", title: "T3. Ficha técnica" },
  { id: "inspector", title: "Novo: secção técnica" },
  { id: "view-eye", title: "Novo: View + olho" },
  { id: "chevron", title: "Novo: chevron de navegação" },
  { id: "verb", title: "1. Ação no título" },
  { id: "view", title: "2. Ação junto da seta" },
  { id: "hint", title: "3. Uma indicação curta" },
];
function SignatureEntryContent({ variant }: { variant: EntryStyle }) {
  if (variant === "closed-dash") return <SignatureReviewEntryContent />;
  if (variant.startsWith("closed-")) return <>
    <CodeBlock size={18} aria-hidden="true" />
    <span className={styles.entryCopy}>
      <span className={variant === "closed-line" ? styles.inspectorTitle : styles.techLabel}>Signature data</span>
      <span className={styles.inspectorMeta}>EIP-712<span className={styles.entryNetwork}> · {PUB_CHAIN.name}</span></span>
    </span>
    <span className={styles.entryView}>View</span><Eye size={18} aria-hidden="true" />
  </>;
  if (variant.startsWith("tech-")) return <>
    <CodeBlock size={18} aria-hidden="true" />
    <span className={styles.entryCopy}>
      {variant === "tech-caps" ? <>
        <span className={styles.techCaps}>Signature data</span>
        <span className={styles.techSecondary}>EIP-712 · {PUB_CHAIN.name}</span>
      </> : variant === "tech-format" ? <>
        <span className={styles.techProtocol}>EIP-712</span>
        <span className={styles.techSecondary}>Signature data · {PUB_CHAIN.name}</span>
      </> : <>
        <span className={styles.techLabel}>Signature data</span>
        <span className={styles.techFields}>
          <span><span className={styles.techFieldLabel}>Format</span><span>EIP-712</span></span>
          <span><span className={styles.techFieldLabel}>Network</span><span>{PUB_CHAIN.name}</span></span>
        </span>
      </>}
    </span>
    <span className={styles.entryView}>View</span><Eye size={18} aria-hidden="true" />
  </>;
  if (variant === "inspector") return <>
    <CodeBlock size={18} aria-hidden="true" />
    <span className={styles.entryCopy}>
      <span className={styles.inspectorTitle}>Signature data</span>
      <span className={styles.inspectorMeta}>EIP-712 · {PUB_CHAIN.name} · Chain ID {PUB_CHAIN.id}</span>
    </span>
    <span className={styles.entryView}>View</span><Eye size={18} aria-hidden="true" />
  </>;
  return <>
    <CodeBlock size={18} aria-hidden="true" />
    <span className={styles.entryCopy}>
      <span>{variant === "verb" ? "View signature data" : "Signature data"}</span>
      {variant === "hint" && <span className={styles.entryCaption}>Open signing details</span>}
    </span>
    <small>EIP-712</small>
    {(variant === "view" || variant === "view-eye") && <span className={styles.entryView}>View</span>}
    {variant === "view-eye" ? <Eye size={18} aria-hidden="true" /> : variant === "chevron" ? <CaretRight size={22} weight="regular" aria-hidden="true" /> : variant !== "verb" ? <ArrowRight size={16} aria-hidden="true" /> : null}
  </>;
}
export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "true") return { notFound: true };
  return { props: {} };
};
export default function StepOptions() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [entryStyle, setEntryStyle] = useState<EntryStyle>("closed-dash");
  const [detail, setDetail] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const entry = useRef<HTMLButtonElement>(null);
  const reviewScroll = useRef(0);
  const returning = useRef(false);
  useEffect(() => {
    if (!scenario) return;
    if (detail) {
      body.current?.scrollTo({ top: 0 });
      body.current?.querySelector<HTMLElement>('[aria-label="Signature data"]')?.focus({ preventScroll: true });
    } else if (returning.current) {
      returning.current = false;
      body.current?.scrollTo({ top: reviewScroll.current });
      entry.current?.focus({ preventScroll: true });
    }
  }, [detail, scenario]);
  const trigger = useRef<HTMLElement | null>(null);
  return <main className={styles.page}>
    <Head><title>Passos do voto · todos os percursos</title></Head>
    <header className={styles.header}>
      <h1>Todos os percursos do ballot</h1>
      <p>O mesmo estilo com 1, 2, 3 ou 4 passos. Abre cada revisão para ver o percurso completo.</p>
      <Link href="/plugins/proposals/#/proposals/private/1">Voltar à proposta ↗</Link>
    </header>
    <section className={styles.entryStudy} aria-label="Alternativas para abrir Signature data">
      <h2>Signature data: último round</h2>
      <div className={styles.grid}>
        {entryOptions.map(item => <article className={styles.card} key={item.id}>
          <h3>{item.title}</h3>
          <button className={styles.entry} data-presentation={item.id} type="button" aria-label={`Experimentar ${item.title}`} onClick={event => {
            trigger.current = event.currentTarget; returning.current = false; reviewScroll.current = 0;
            setEntryStyle(item.id); setDetail(false); setScenario(scenarios[item.id === "inspector" || item.id.startsWith("tech-") || item.id.startsWith("closed-") ? 0 : 3]);
          }}><SignatureEntryContent variant={item.id} /></button>
        </article>)}
      </div>
    </section>
    <section className={styles.stepGrid} aria-label="Percursos reais do ballot">
      {scenarios.map(item => <article key={item.id} className={styles.card}>
        <h2>{item.title}</h2>
        <p>{item.steps} {item.steps === 1 ? "passo" : "passos"} · {item.includeVote && item.includeMask ? "2 envios" : "1 envio"}</p>
        {item.steps > 1 && <SigningSteps numberStyle="inline-small" includeVote={item.includeVote} switchWallet={item.switchWallet} includeMask={item.includeMask} explanationStyle="inline" />}
        <ActionButton onClick={event => { trigger.current = event.currentTarget; returning.current = false; reviewScroll.current = 0; setDetail(false); setScenario(item); }}>Ver revisão: {item.title}</ActionButton>
      </article>)}
    </section>
    <ActionTray open={scenario !== null} pending={false} triggerRef={trigger} onClose={() => setScenario(null)}
      title={detail ? "Signature data" : scenario?.includeVote ? "Confirm your vote" : "Confirm mask"}
      onBack={detail ? () => { returning.current = true; setDetail(false); } : undefined}
      backLabel="Back to review"
      className="ballot-review ballot-review-choice-first ballot-review-with-footer ballot-review-signature-expanded">
      <div ref={body} className="ballot-review-body">
        <FluidHeight layoutKey={detail ? "data" : "review"}>
          <div className="motion-tab-panels">
            <MotionPanel active={!detail} direction="left">
              <div className={styles.review}>
                <div className="ballot-review-summary">
                  <div className="ballot-review-row"><span>{scenario?.includeVote ? "You're voting" : "Ballot"}</span><strong className="ballot-review-choice">{scenario?.includeVote ? <><span className="swatch" style={{ background: "var(--if-brand-green)" }} />Yes</> : "Mask"}</strong></div>
                  <div className="ballot-review-row"><span>{scenario?.includeVote ? "Your voting power" : "Voting power"}</span><strong>{scenario?.includeVote ? "49,750 FOLD · 99.50%" : "None"}</strong></div>
                </div>
                {scenario?.includeMask && <div className="ballot-review-row"><span>Mask recipient</span><strong>Random eligible voter</strong></div>}
                {scenario?.switchWallet && <div className="ballot-review-row"><span>Sending wallet</span><strong>Another wallet</strong></div>}
                {scenario && scenario.steps > 1 && <SigningSteps numberStyle="inline-small" includeVote={scenario.includeVote} switchWallet={scenario.switchWallet} includeMask={scenario.includeMask} explanationStyle="inline" />}
                {scenario?.includeVote &&                 <button ref={entry} className={styles.entry} data-presentation={entryStyle} type="button" onClick={() => { reviewScroll.current = body.current?.scrollTop ?? 0; setDetail(true); }}>
                  <SignatureEntryContent variant={entryStyle} />
                </button>}
              </div>
            </MotionPanel>
            <MotionPanel active={detail} direction="right"><SignatureData full /></MotionPanel>
          </div>
        </FluidHeight>
      </div>
      {!detail && <div className="ballot-review-footer"><ActionButton intent="vote" onClick={() => setScenario(null)}>{scenario?.switchWallet ? "Prepare vote" : scenario?.includeVote ? "Send vote" : "Send mask"}</ActionButton></div>}
    </ActionTray>
  </main>;
}
