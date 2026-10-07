import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { ProposalStatus } from "@aragon/ods";
import { BallotActivity } from "@/components/proposalVoting/ballotActivity";
import { ProposalVotingContext } from "@/components/proposalVoting/proposalVotingContext";
import { ClosedVoteStatus } from "@/components/proposalVoting/closedVoteStatus";
import {
  ResultNotice,
  ResultPanel,
  resultPercentages,
  type ResultQuorum,
} from "@/components/proposalVoting/resultPanel";
import type { VoteStatus } from "@/components/proposalVoting/voteStatus";
import { NetworkProgress } from "@/plugins/crispVoting/components/networkProgress";
import { e3Lifecycle, type E3Lifecycle } from "@/plugins/crispVoting/utils/e3Lifecycle";
import { E3Stage, E3FailureReason, describeE3Failure } from "@/plugins/crispVoting/hooks/useE3Status";
import constitution from "@/dev/snapshots/constitution-proposal.json";
import styles from "@/dev/resultExploration.module.css";

type NoticeResult = { kind: "notice"; state: string; title: string; paragraphs: string[] };
type TallyResult = {
  kind: "tally";
  counts: readonly [bigint, bigint, bigint];
  unit: "FOLD" | "credits";
  status: ProposalStatus;
  quorum: ResultQuorum | null;
  submitted?: boolean;
};
type Scenario = {
  id: string;
  title: string;
  explanation: string;
  method: "Secret ballot" | "Transparent fallback";
  result: NoticeResult | TallyResult;
  personal: { status: VoteStatus; choice?: string };
  network?: E3Lifecycle;
  activityCount: number;
};

const compute = e3Lifecycle({ stage: E3Stage.KeyPublished, inputStartMs: 1_000, inputEndMs: 2_000, nowMs: 3_000 });
const decrypt = e3Lifecycle({ stage: E3Stage.CiphertextReady });
const published = e3Lifecycle({ stage: E3Stage.Complete });
const failed = e3Lifecycle({ stage: E3Stage.Failed, failed: true });

// Every number and personal status below is illustrative; these cases never query a wallet or chain.
const scenarios: Scenario[] = [
  {
    id: "private-compute",
    title: "Privado · à espera de Compute",
    explanation: "Votação fechada; a rede está no passo 5 de 7 e ainda não publicou o resultado.",
    method: "Secret ballot",
    result: {
      kind: "notice",
      state: "Voting closed",
      title: "Awaiting tally",
      paragraphs: ["The result has not been published. The Foundation stage has not started."],
    },
    personal: { status: "not-voted" },
    network: compute,
    activityCount: 4,
  },
  {
    id: "private-decryption",
    title: "Privado · decriptação",
    explanation: "Compute terminou; a rede está no passo 6 de 7 e o agregado continua indisponível.",
    method: "Secret ballot",
    result: {
      kind: "notice",
      state: "Voting closed",
      title: "Awaiting tally",
      paragraphs: ["The result has not been published. The Foundation stage has not started."],
    },
    personal: { status: "confirmed" },
    network: decrypt,
    activityCount: 8,
  },
  {
    id: "private-failed",
    title: "Privado · ronda falhada",
    explanation: "Falha confirmada de Compute; não existe resultado nem passo saudável em curso.",
    method: "Secret ballot",
    result: {
      kind: "notice",
      state: "Voting closed",
      title: "Round failed",
      paragraphs: [
        `${describeE3Failure(E3FailureReason.ComputeTimeout)} This proposal could not be tallied or executed.`,
      ],
    },
    personal: { status: "unknown" },
    network: failed,
    activityCount: 3,
  },
  {
    id: "private-published-loading",
    title: "Privado · publicado, totais em carga",
    explanation: "A rede confirmou publicação no passo 7 de 7; a leitura dos totais ainda não chegou.",
    method: "Secret ballot",
    result: {
      kind: "notice",
      state: "Voting closed",
      title: "Result published",
      paragraphs: ["The network has published the result. The voting totals are not available here yet."],
    },
    personal: { status: "unknown" },
    network: published,
    activityCount: 8,
  },
  {
    id: "public-pass",
    title: "Público · voto passou",
    explanation: "Maioria e quorum confirmados; a aprovação final da Foundation ainda é outra etapa.",
    method: "Transparent fallback",
    result: {
      kind: "tally",
      counts: [72n, 18n, 10n],
      unit: "FOLD",
      status: ProposalStatus.EXECUTABLE,
      quorum: { reached: true, turnoutPct: 16.7, requiredPct: 10 },
    },
    personal: { status: "confirmed", choice: "Yes" },
    activityCount: 12,
  },
  {
    id: "private-pass",
    title: "Privado · voto passou",
    explanation: "Tally publicado e favorável; o resultado do corpo foi enviado, sem afirmar execução do DAO.",
    method: "Secret ballot",
    result: {
      kind: "tally",
      counts: [74n, 12n, 14n],
      unit: "credits",
      status: ProposalStatus.ACCEPTED,
      quorum: { reached: true, turnoutPct: 22, requiredPct: 10 },
      submitted: true,
    },
    personal: { status: "confirmed" },
    network: published,
    activityCount: 10,
  },
  {
    id: "public-reject",
    title: "Público · rejeitado",
    explanation: "Quorum atingido, mas os votos Yes não vencem No.",
    method: "Transparent fallback",
    result: {
      kind: "tally",
      counts: [35n, 55n, 10n],
      unit: "FOLD",
      status: ProposalStatus.REJECTED,
      quorum: { reached: true, turnoutPct: 18, requiredPct: 10 },
    },
    personal: { status: "not-voted" },
    activityCount: 9,
  },
  {
    id: "quorum-fail",
    title: "Público · quorum insuficiente",
    explanation: "Yes lidera, mas a participação não atinge o mínimo; não se declara vitória.",
    method: "Transparent fallback",
    result: {
      kind: "tally",
      counts: [75n, 20n, 5n],
      unit: "FOLD",
      status: ProposalStatus.REJECTED,
      quorum: { reached: false, turnoutPct: 6.7, requiredPct: 10 },
    },
    personal: { status: "not-voted" },
    activityCount: 6,
  },
  {
    id: "zero-votes",
    title: "Público · zero votos confirmados",
    explanation: "Leitura final confirmada, sem votos registados; o resultado não é favorável.",
    method: "Transparent fallback",
    result: {
      kind: "tally",
      counts: [0n, 0n, 0n],
      unit: "FOLD",
      status: ProposalStatus.REJECTED,
      quorum: { reached: false, turnoutPct: 0, requiredPct: 10 },
    },
    personal: { status: "not-voted" },
    activityCount: 0,
  },
  {
    id: "unresolved",
    title: "Público · resultado por confirmar",
    explanation: "Há contagens visíveis, mas falta a confirmação necessária para afirmar aprovação ou rejeição.",
    method: "Transparent fallback",
    result: { kind: "tally", counts: [62n, 28n, 10n], unit: "FOLD", status: ProposalStatus.PENDING, quorum: null },
    personal: { status: "unknown" },
    activityCount: 5,
  },
];

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DESIGN_PREVIEW !== "true")
    return { notFound: true };
  return { props: {} };
};

function ScenarioResult({ result }: { result: Scenario["result"] }) {
  if (result.kind === "notice") {
    return (
      <ResultNotice state={result.state} title={result.title}>
        {result.paragraphs.map((paragraph) => (
          <p className="vp-note" key={paragraph}>
            {paragraph}
          </p>
        ))}
      </ResultNotice>
    );
  }

  const total = result.counts.reduce((sum, count) => sum + count, 0n);
  const percentages = resultPercentages([...result.counts]);
  const rows = ["Yes", "No", "Abstain"].map((option, index) => ({
    option,
    index,
    percentage: percentages[index],
    amount: `${result.counts[index]} ${result.unit}`,
  }));
  return (
    <ResultPanel
      rows={rows}
      total={`${total} ${result.unit}`}
      status={result.status}
      quorum={result.quorum}
      submitted={result.submitted}
      isEmpty={total === 0n}
    />
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const privateBallot = scenario.method === "Secret ballot";
  return (
    <article className={styles.scenario} aria-labelledby={`scenario-${scenario.id}`}>
      <div className={styles.scenarioIntro}>
        <p className={styles.scenarioTag}>Cenário demonstrativo · {scenario.method}</p>
        <h2 id={`scenario-${scenario.id}`}>{scenario.title}</h2>
        <p>{scenario.explanation}</p>
      </div>
      <div className={`proposal-detail-ballot ${styles.ballot}`}>
        <ScenarioResult result={scenario.result} />
        <ProposalVotingContext
          networkProgress={scenario.network && <NetworkProgress progress={scenario.network} />}
          personalVote={
            <ClosedVoteStatus
              status={scenario.personal.status}
              secret={privateBallot}
              choice={scenario.personal.choice}
              onConnect={() => undefined}
            />
          }
          details={
            <div className={styles.disclosureBody}>
              <p>Illustrative scenario data. No wallet or chain read is made on this page.</p>
              <dl>
                <div>
                  <dt>Method</dt>
                  <dd>{scenario.method}</dd>
                </div>
                <div>
                  <dt>Snapshot</dt>
                  <dd>Demo snapshot</dd>
                </div>
                <div>
                  <dt>Stage</dt>
                  <dd>Voting body</dd>
                </div>
              </dl>
            </div>
          }
          activity={
            <BallotActivity
              title={
                <>
                  {privateBallot ? "Encrypted ballot activity" : "Public votes"}{" "}
                  <span className="proposal-detail-count">{scenario.activityCount}</span>
                </>
              }
            >
              <div className={styles.disclosureBody}>
                <p>Demo activity count for visual review only. It does not represent unique voters.</p>
              </div>
            </BallotActivity>
          }
        />
      </div>
    </article>
  );
}

export default function DesignResults() {
  const [narrow, setNarrow] = useState(false);
  return (
    <main className={styles.page}>
      <Head>
        <title>Estados do resultado · Interfold Governance</title>
      </Head>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Governance · revisão local</p>
        <h1>Estados do resultado</h1>
        <p>
          Casos simulados com os componentes reais do resultado. Contagens, atividade e estado pessoal são dados
          demonstrativos; esta página não lê a wallet nem a chain.
        </p>
        <div className={styles.toolbar}>
          <Link href={`/plugins/proposals/#/proposals/private/${constitution.proposal.sppId}`}>
            Voltar à proposta Constitution ↗
          </Link>
          <label className={styles.narrowToggle}>
            <input type="checkbox" checked={narrow} onChange={(event) => setNarrow(event.target.checked)} />
            Ver largura estreita
          </label>
        </div>
      </header>
      <section className={styles.grid} data-narrow={narrow} aria-label="Matriz dos estados do resultado">
        {scenarios.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} />
        ))}
      </section>
    </main>
  );
}
