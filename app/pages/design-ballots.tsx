import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { ActionButton } from "@/components/input/actionButton";
import { ChoiceMenu } from "@/components/input/choiceMenu";
import { BallotExploration, ballotVariants, type BallotVariant } from "@/dev/ballotExploration";
import { MaskExploration, maskVariants, type MaskVariant } from "@/dev/maskExploration";
import { voteChoiceVariants, type VoteChoiceVariant } from "@/dev/voteChoiceVariants";
import styles from "@/dev/ballotExploration.module.css";

type View = BallotVariant | MaskVariant | VoteChoiceVariant | "all";
type Study = "ballots" | "masks" | "votes";
type StudyProps = { initialView: View; initialStudy: Study };
export const getServerSideProps: GetServerSideProps<StudyProps> = async ({ query }) => {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "true")
    return { notFound: true };
  const initialStudy = query.study === "masks" ? "masks" : query.study === "votes" ? "votes" : "ballots";
  const variants =
    initialStudy === "masks" ? maskVariants : initialStudy === "votes" ? voteChoiceVariants : ballotVariants;
  return { props: { initialStudy, initialView: variants.find((v) => v.id === query.v)?.id ?? "all" } };
};

export default function BallotStudy({ initialView, initialStudy }: StudyProps) {
  const [view, setView] = useState<View>(initialView);
  const [study, setStudy] = useState<Study>(initialStudy);
  const [changingVote, setChangingVote] = useState(false);
  const variants = study === "masks" ? maskVariants : study === "votes" ? voteChoiceVariants : ballotVariants;
  const count = variants.length;
  const setVariant = (next: View, nextStudy: Study = study) => {
    setView(next);
    setStudy(nextStudy);
    const url = new URL(window.location.href);
    url.searchParams.set("v", next);
    url.searchParams.set("study", nextStudy);
    window.history.replaceState(window.history.state, "", url);
  };
  const selected = variants.find((variant) => variant.id === view);
  const index = variants.findIndex((variant) => variant.id === view);
  const renderPreview = (variant: View) =>
    study === "votes" ? (
      <MaskExploration
        key={`${variant}-${changingVote}`}
        variant="paths"
        votePresentation={variant as VoteChoiceVariant}
        changingVote={changingVote}
      />
    ) : study === "masks" ? (
      <MaskExploration
        key={`${variant}-${changingVote}`}
        variant={variant as MaskVariant}
        changingVote={changingVote}
      />
    ) : (
      <BallotExploration
        key={`${variant}-${changingVote}`}
        variant={variant as BallotVariant}
        changingVote={changingVote}
      />
    );
  return (
    <main className={styles.study}>
      <Head>
        <title>{`${study === "votes" ? "Hierarquia das opções de voto · 6 versões" : study === "masks" ? "Voto e máscara · 4 percursos" : "8 formas de organizar o voto"} · Interfold`}</title>
      </Head>
      <header className={styles.intro}>
        <div>
          <p className="ui-label">Exploração de interface · {count} alternativas</p>
          <h1>
            {study === "votes"
              ? "A decisão vem primeiro."
              : study === "masks"
                ? "Voto, máscara, ou os dois?"
                : "Menos ruído. Uma escolha de cada vez."}
          </h1>
          <p>
            {study === "votes"
              ? "Seis maneiras de dar mais presença a Yes / No / Abstain no mesmo ballot. Seleciona um voto, abre Privacy tools e compara o equilíbrio entre as duas áreas."
              : study === "masks"
                ? "Quatro formas de chegar a três combinações: só voto, voto + máscara, ou só máscara. Experimenta mudar entre elas, incluindo quando já existe um voto."
                : "Onde deve viver a randomização? E quando faz sentido mostrar a máscara? Experimenta as opções e abre a revisão para comparar o percurso completo."}
          </p>
        </div>
        <Link href="/plugins/proposals/#/">Voltar às propostas ↗</Link>
      </header>
      <div className={styles.studyTabs} role="group" aria-label="Tema da exploração">
        <ActionButton
          size="compact"
          intent={study === "ballots" ? "confirm" : "open"}
          aria-pressed={study === "ballots"}
          onClick={() => setVariant("all", "ballots")}
        >
          Organização do cartão · 8
        </ActionButton>
        <ActionButton
          size="compact"
          intent={study === "masks" ? "confirm" : "open"}
          aria-pressed={study === "masks"}
          onClick={() => setVariant("all", "masks")}
        >
          Voto e máscara · 4
        </ActionButton>
        <ActionButton
          size="compact"
          intent={study === "votes" ? "confirm" : "open"}
          aria-pressed={study === "votes"}
          onClick={() => setVariant("all", "votes")}
        >
          Hierarquia do voto · 6
        </ActionButton>
      </div>
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <ChoiceMenu<View>
            label="Organização"
            value={view}
            onChange={(next) => setVariant(next)}
            options={[
              { value: "all", label: `Comparar as ${count}` },
              ...variants.map((v, i) => ({ value: v.id, label: `${i + 1}. ${v.name}` })),
            ]}
          />
        </div>
        <div className={styles.controlGroup} role="group" aria-label="Estado do voto">
          <ActionButton
            size="compact"
            intent={changingVote ? "open" : "confirm"}
            aria-pressed={!changingVote}
            onClick={() => setChangingVote(false)}
          >
            Primeiro voto
          </ActionButton>
          <ActionButton
            size="compact"
            intent={changingVote ? "confirm" : "open"}
            aria-pressed={changingVote}
            onClick={() => setChangingVote(true)}
          >
            Alterar voto
          </ActionButton>
        </div>
      </div>
      <div className={styles.shortlist}>
        <span>Começaria por comparar:</span>
        {variants.map(
          (v, i) =>
            v.recommended && (
              <ActionButton key={v.id} size="compact" onClick={() => setVariant(v.id)}>
                {i + 1}. {v.name}
              </ActionButton>
            )
        )}
      </div>
      <p className={styles.status}>
        Dados de exemplo · sem transações · voto e máscara podem ser combinados em todas as versões.
      </p>
      {selected ? (
        <section className={styles.focus} data-wide={view === "separate"}>
          <aside className={styles.notes}>
            <span className="ui-label">
              Alternativa {index + 1} / {count}
            </span>
            <h2>{selected.name}</h2>
            <p>{selected.idea}</p>
            <p>
              <strong>O que ganha</strong>
              {selected.gain}
            </p>
            <p>
              <strong>O compromisso</strong>
              {selected.cost}
            </p>
            {study === "votes" && (
              <Link
                className={styles.studySiteLink}
                href={`/plugins/proposals/?voteStyle=${selected.id}#/proposals/private/1`}
              >
                Ver esta versão na proposta ↗
              </Link>
            )}
            <div className={styles.navigation}>
              <ActionButton size="compact" onClick={() => setVariant(variants[(index + count - 1) % count].id)}>
                ← Anterior
              </ActionButton>
              <ActionButton size="compact" onClick={() => setVariant(variants[(index + 1) % count].id)}>
                Seguinte →
              </ActionButton>
            </div>
            <ActionButton size="compact" onClick={() => setVariant("all")}>
              Comparar as {count}
            </ActionButton>
          </aside>
          {renderPreview(selected.id)}
        </section>
      ) : (
        <div className={styles.grid}>
          {variants.map((variant, i) => (
            <section key={variant.id} className={styles.card} aria-label={`${i + 1}. ${variant.name}`}>
              <header className={styles.cardHead}>
                <div className={styles.cardTitle}>
                  <span className={styles.number}>0{i + 1}</span>
                  <h2>{variant.name}</h2>
                </div>
                <p>{variant.idea}</p>
                <ActionButton size="compact" onClick={() => setVariant(variant.id)}>
                  Explorar esta versão ↗
                </ActionButton>
              </header>
              {renderPreview(variant.id)}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
