import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Proposals from "@/plugins/governance/pages/list";
import styles from "@/dev/proposalEmphasis.module.css";

const variants = [
  { id: "reference", label: "Atual", description: "A versão guardada: todos os botões sobre branco." },
  { id: "ink", label: "1 · Preto", description: "Vote passa a ação principal, com o mesmo preto de Create proposal e Lock FOLD." },
  { id: "green", label: "2 · Verde", description: "O verde do estado Active liga-se ao botão Vote. A proposta continua sobre branco." },
  { id: "outline", label: "3 · Contorno", description: "Texto e contorno verdes dão destaque ao Vote com menos peso visual." },
  { id: "rail", label: "4 · Linha lateral", description: "Uma linha verde identifica a proposta ativa; Vote mantém o destaque em verde sólido." },
  { id: "action", label: "5 · Área de voto", description: "Prazo, resultados e Vote ficam num pequeno bloco neutro, com o botão verde a fechar o grupo." },
] as const;
type Variant = (typeof variants)[number]["id"];

// Reuse the working list and local preview data; comparison styles never enter the live page.
export const getServerSideProps: GetServerSideProps<{ initialVariant: Variant }> = async ({ query }) => {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "true") {
    return { notFound: true };
  }
  return { props: { initialVariant: variants.find((variant) => variant.id === query.v)?.id ?? "green" } };
};

export default function ProposalEmphasis({ initialVariant }: { initialVariant: Variant }) {
  const [selected, setSelected] = useState(initialVariant);
  const { events } = useRouter();
  useEffect(() => {
    // Creation and full proposal routes belong to the actual plugin router.
    const followRoute = () => {
      if (window.location.hash && window.location.hash !== "#/") {
        window.location.assign(`/plugins/proposals/${window.location.hash}`);
      }
    };
    followRoute();
    window.addEventListener("hashchange", followRoute);
    events.on("hashChangeComplete", followRoute);
    return () => {
      window.removeEventListener("hashchange", followRoute);
      events.off("hashChangeComplete", followRoute);
    };
  }, [events]);

  return (
    <main className={styles.study} data-variant={selected}>
      <Head><title>Propostas ativas · 5 versões · Interfold</title></Head>
      <header className={styles.controls}>
        <div className={styles.intro}>
          <div><p className="ui-label">Estudo de interface · dados de exemplo</p><h1>Dar destaque às propostas ativas.</h1></div>
          <Link href="/plugins/proposals/#/">Voltar à página atual ↗</Link>
        </div>
        <div className={styles.options} role="group" aria-label="Versão de destaque">
          {variants.map((variant) => (
            <button key={variant.id} type="button" aria-pressed={selected === variant.id} onClick={() => {
              setSelected(variant.id);
              const url = new URL(window.location.href);
              url.searchParams.set("v", variant.id);
              window.history.replaceState(window.history.state, "", url);
            }}>{variant.label}</button>
          ))}
        </div>
        <p className={styles.description} aria-live="polite">{variants.find((variant) => variant.id === selected)!.description}</p>
      </header>
      <Proposals />
    </main>
  );
}
