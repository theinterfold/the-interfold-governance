import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CodeBlock, ArrowRight } from "@phosphor-icons/react";
import { ActionButton } from "@/components/input/actionButton";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { SigningSteps, SignatureData, SignatureDisclosure } from "@/dev/signingExploration";
import styles from "@/dev/signatureOptions.module.css";

type Option = "replace" | "expand" | "summary";
const options: { id: Option; name: string; description: string }[] = [
  {
    id: "replace",
    name: "1. Dados no mesmo modal",
    description: "A revisão dá lugar aos dados completos. Voltar recupera a revisão.",
  },
  {
    id: "expand",
    name: "2. Expansão com foco nos dados",
    description: "Abre na revisão e desloca o conteúdo para tornar a abertura visível.",
  },
  {
    id: "summary",
    name: "3. Resumo antes dos dados",
    description: "Mostra rede, programa e ronda. Os dados completos abrem no mesmo modal.",
  },
];
export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "true")
    return { notFound: true };
  return { props: {} };
};
export default function SignatureOptions() {
  const [option, setOption] = useState<Option | null>(null);
  const [detail, setDetail] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [longPath, setLongPath] = useState(true);
  const trigger = useRef<HTMLElement | null>(null);
  const entry = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const disclosure = useRef<HTMLDivElement>(null);
  const returning = useRef(false);
  const reviewScroll = useRef(0);
  useEffect(() => {
    if (!expanded || option !== "expand") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(
      () => {
        const scroll = body.current;
        const target = disclosure.current;
        if (scroll && target)
          scroll.scrollTo({
            top: scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top,
            behavior: reduced ? "auto" : "smooth",
          });
      },
      reduced ? 0 : 340
    );
    return () => clearTimeout(timer);
  }, [expanded, option]);
  useEffect(() => {
    if (!option) return;
    if (detail) {
      body.current?.scrollTo({ top: 0 });
      body.current?.querySelector<HTMLElement>('[aria-label="Signature data"]')?.focus({ preventScroll: true });
    } else if (returning.current) {
      returning.current = false;
      body.current?.scrollTo({ top: reviewScroll.current });
      entry.current?.focus({ preventScroll: true });
    }
  }, [detail, option]);
  const openData = () => {
    reviewScroll.current = body.current?.scrollTop ?? 0;
    setDetail(true);
  };
  const back = () => {
    returning.current = true;
    setDetail(false);
  };
  return (
    <main className={styles.page}>
      <Head>
        <title>Signature data · três alternativas</title>
      </Head>
      <header className={styles.header}>
        <h1>Signature data: três alternativas</h1>
        <p>Experimenta abrir, ler e regressar à revisão em cada versão.</p>
        <Link href="/plugins/proposals/#/proposals/private/1">Voltar à proposta ↗</Link>
      </header>
      <div className={styles.controls}>
        <ActionButton
          size="compact"
          intent={longPath ? "confirm" : "open"}
          aria-pressed={longPath}
          onClick={() => setLongPath(!longPath)}
        >
          {longPath ? "Outra wallet + máscara" : "Só voto"}
        </ActionButton>
      </div>
      <section className={styles.grid} aria-label="Alternativas de Signature data">
        {options.map((item) => (
          <article className={styles.card} key={item.id}>
            <h2>{item.name}</h2>
            <p>{item.description}</p>
            <ActionButton
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setDetail(false);
                setExpanded(false);
                setOption(item.id);
              }}
            >
              Experimentar alternativa {item.name[0]}
            </ActionButton>
          </article>
        ))}
      </section>
      <ActionTray
        open={option !== null}
        title={detail ? "Signature data" : "Confirm your vote"}
        pending={false}
        triggerRef={trigger}
        onClose={() => setOption(null)}
        onBack={detail ? back : undefined}
        backLabel="Back to review"
        className={`ballot-review ballot-review-with-footer ${styles.tray}`}
      >
        <div ref={body} className={`ballot-review-body ${styles.body}`}>
          <FluidHeight layoutKey={detail ? "data" : "review"}>
            <div className="motion-tab-panels">
              <MotionPanel active={!detail} direction="left">
                <div className={styles.review}>
                  <div className={styles.choice}>
                    <span>You&apos;re voting</span>
                    <strong>
                      <i />
                      Yes
                    </strong>
                  </div>
                  <div className={styles.fact}>
                    <span>Your voting power</span>
                    <strong>
                      <span className={styles.amount}>49,750 FOLD</span> 99.50%
                    </strong>
                  </div>
                  {longPath && (
                    <>
                      <div className={styles.fact}>
                        <span>Mask recipient</span>
                        <strong>Random eligible voter</strong>
                      </div>
                      <div className={styles.fact}>
                        <span>Sending wallet</span>
                        <strong>Another wallet</strong>
                      </div>
                      <p className={styles.submissions}>2 submissions · Vote → Mask</p>
                    </>
                  )}
                  <SigningSteps numberStyle="inline-small" switchWallet={longPath} includeMask={longPath} />
                  {option === "expand" ? (
                    <div ref={disclosure}>
                      <SignatureDisclosure onOpenChange={setExpanded} />
                    </div>
                  ) : (
                    <>
                      {option === "summary" && (
                        <dl className={styles.summary} aria-label="Signature summary">
                          <div>
                            <dt>Network</dt>
                            <dd>Ethereum · Chain ID 1</dd>
                          </div>
                          <div>
                            <dt>Program</dt>
                            <dd>CRISP · EIP-712</dd>
                          </div>
                          <div>
                            <dt>Voting round</dt>
                            <dd>1</dd>
                          </div>
                        </dl>
                      )}
                      <button ref={entry} className={styles.entry} type="button" onClick={openData}>
                        <CodeBlock size={18} aria-hidden="true" />
                        <span>{option === "summary" ? "View full data" : "Signature data"}</span>
                        <small>EIP-712</small>
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </MotionPanel>
              <MotionPanel active={detail} direction="right">
                <SignatureData full />
              </MotionPanel>
            </div>
          </FluidHeight>
        </div>
        {!detail && (
          <div className="ballot-review-footer">
            <ActionButton intent="vote" onClick={() => setOption(null)}>
              {longPath ? "Prepare vote" : "Send vote"}
            </ActionButton>
          </div>
        )}
      </ActionTray>
    </main>
  );
}
