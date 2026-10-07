import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRef, useState } from "react";
import { ActionButton } from "@/components/input/actionButton";
import { BallotReview } from "@/components/proposalVoting/ballot";
import {
  SigningExplanation,
  SigningSteps,
  signingVariants,
  stepNumberStyles,
  type SigningVariant,
  type StepNumberStyle,
} from "@/dev/signingExploration";
import styles from "@/dev/signingExploration.module.css";

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "true")
    return { notFound: true };
  return { props: {} };
};

export default function SigningStudy() {
  const [open, setOpen] = useState<SigningVariant | null>(null);
  const [numberStyle, setNumberStyle] = useState<StepNumberStyle>("inline-small");
  const [switchWallet, setSwitchWallet] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  return (
    <main className={styles.page}>
      <Head>
        <title>Assinatura e passos · Interfold</title>
      </Head>
      <header className={styles.intro}>
        <div>
          <p className="ui-label">Exploração de interface · assinatura e passos</p>
          <h1>O que vamos pedir à wallet?</h1>
          <p>
            Exemplo: mudar o voto de No para Abstain, com 49,750 FOLD, e enviar uma máscara depois. Compara a numeração
            dos passos e onde mostrar os dados da assinatura.
          </p>
        </div>
        <Link href="/plugins/proposals/#/proposals/private/1">Voltar à proposta ↗</Link>
      </header>

      <section id="numbering" className={styles.numberStudy} aria-labelledby="numbering-title">
        <div className={styles.numberStudyHead}>
          <div>
            <span className="ui-label">Estudo dos passos</span>
            <h2 id="numbering-title">Como marcar a sequência?</h2>
            <p>Compara o alinhamento e o peso dos números. Inclui a troca de wallet para ver a sequência mais longa.</p>
          </div>
          <div className={styles.walletToggle} role="group" aria-label="Percurso da wallet">
            <ActionButton
              size="compact"
              intent={switchWallet ? "open" : "confirm"}
              aria-pressed={!switchWallet}
              onClick={() => setSwitchWallet(false)}
            >
              Mesma wallet
            </ActionButton>
            <ActionButton
              size="compact"
              intent={switchWallet ? "confirm" : "open"}
              aria-pressed={switchWallet}
              onClick={() => setSwitchWallet(true)}
            >
              Mudar de wallet
            </ActionButton>
          </div>
        </div>
        <div className={styles.numberGrid}>
          {stepNumberStyles.map((style) => (
            <article key={style.id} className={styles.numberCard} data-selected={numberStyle === style.id}>
              <h3>{style.name}</h3>
              <p>{style.idea}</p>
              <SigningSteps numberStyle={style.id} switchWallet={switchWallet} />
              <ActionButton
                size="compact"
                intent={numberStyle === style.id ? "confirm" : "open"}
                aria-pressed={numberStyle === style.id}
                onClick={() => setNumberStyle(style.id)}
              >
                {numberStyle === style.id ? "Em uso nas revisões" : "Ver nas revisões"}
              </ActionButton>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.placementHead}>
        <span className="ui-label">Estudo da assinatura</span>
        <h2>Onde mostrar os dados?</h2>
        <p>As versões abaixo usam a numeração selecionada e o mesmo percurso da wallet.</p>
      </div>

      <div className={styles.grid}>
        {signingVariants.map((variant, index) => (
          <article key={variant.id} className={styles.option}>
            <header className={styles.optionHead}>
              <span className="ui-label">Alternativa {index + 1} / 3</span>
              <h2>{variant.name}</h2>
              <p>{variant.idea}</p>
              <small>{variant.tradeoff}</small>
            </header>
            <div className={styles.example}>
              <h3 className={styles.exampleTitle}>Confirm your vote</h3>
              <div className={styles.choice}>
                <span>You’re voting</span>
                <strong>Abstain</strong>
              </div>
              <div className={styles.fact}>
                <span>Your voting power</span>
                <strong>49,750 FOLD · 99.50%</strong>
              </div>
              <SigningExplanation variant={variant.id} numberStyle={numberStyle} switchWallet={switchWallet} />
              <ActionButton
                size="compact"
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setOpen(variant.id);
                }}
              >
                Ver na revisão completa
              </ActionButton>
              <p className={styles.exampleNote}>Dados e identificadores fictícios. Não abre a wallet nem envia nada.</p>
            </div>
          </article>
        ))}
      </div>

      <BallotReview
        open={open !== null}
        pending={false}
        triggerRef={triggerRef}
        onClose={() => setOpen(null)}
        choice="Abstain"
        optionIndex={2}
        emphasis="choice"
      >
        <div className={styles.reviewContent}>
          <div className="ballot-review-row">
            <span>Your voting power</span>
            <strong>49,750 FOLD · 99.50%</strong>
          </div>
          <div className="ballot-review-row">
            <span>Mask recipient</span>
            <strong>Random eligible voter</strong>
          </div>
          {switchWallet && (
            <div className="ballot-review-row">
              <span>Sending wallet</span>
              <strong>Another wallet</strong>
            </div>
          )}
          {open && <SigningExplanation variant={open} numberStyle={numberStyle} switchWallet={switchWallet} />}
          <ActionButton intent="vote" onClick={() => setOpen(null)}>
            Close example
          </ActionButton>
          <p className={styles.exampleNote}>This design study never requests a real signature or transaction.</p>
        </div>
      </BallotReview>
    </main>
  );
}
