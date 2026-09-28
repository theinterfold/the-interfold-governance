import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { ActionButton } from "@/components/input/actionButton";
import Locker, { type PowerSectionPresentation } from "@/plugins/velocker/pages";
import styles from "@/dev/proposalEmphasis.module.css";

const versions: { id: PowerSectionPresentation; label: string; description: string }[] = [
  {
    id: "inline",
    label: "1 · Intro dentro",
    description:
      "Uma frase curta dentro de cada painel. O mesmo título, texto e alinhamento para conta, locks e delegação.",
  },
  {
    id: "outside",
    label: "2 · Intro por cima",
    description: "Os mesmos títulos e textos ficam por cima dos painéis. Lock FOLD acompanha o título dos locks.",
  },
  {
    id: "compact",
    label: "3 · Só títulos",
    description:
      "A versão mais compacta: títulos dentro dos painéis e contexto junto aos valores e ações, sem introduções adicionais.",
  },
];

export const getServerSideProps: GetServerSideProps<{ initialVersion: PowerSectionPresentation }> = async ({
  query,
}) => {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "true") {
    return { notFound: true };
  }
  return { props: { initialVersion: versions.find((version) => version.id === query.v)?.id ?? "outside" } };
};

/** Real components and local demo state; switching copy never remounts the forms. */
export default function PowerIntroductions({ initialVersion }: { initialVersion: PowerSectionPresentation }) {
  const [selected, setSelected] = useState(initialVersion);
  return (
    <main>
      <Head>
        <title>Voting power · 3 introduções · Interfold</title>
      </Head>
      <header className={styles.controls}>
        <div className={styles.intro}>
          <div>
            <p className="ui-label">Estudo de interface · dados de exemplo</p>
            <h1>Títulos e introduções.</h1>
          </div>
          <Link href="/plugins/lock/#/">Voltar à página atual ↗</Link>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Versão das introduções">
          {versions.map((version) => (
            <ActionButton
              key={version.id}
              size="compact"
              intent={selected === version.id ? "confirm" : "open"}
              aria-pressed={selected === version.id}
              onClick={() => {
                setSelected(version.id);
                const url = new URL(window.location.href);
                url.searchParams.set("v", version.id);
                window.history.replaceState(window.history.state, "", url);
              }}
            >
              {version.label}
            </ActionButton>
          ))}
        </div>
        <p className={styles.description} aria-live="polite">
          {versions.find((version) => version.id === selected)?.description}
        </p>
      </header>
      <Locker sectionPresentation={selected} showPageIntro={false} />
    </main>
  );
}
