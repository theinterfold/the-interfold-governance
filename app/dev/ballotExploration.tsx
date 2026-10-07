import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { useEffect, useId, useRef, useState } from "react";
import {
  BallotChoices,
  BallotOptionalAction,
  BallotPanel,
  BallotReview,
  BallotSubmissionInfo,
} from "@/components/proposalVoting/ballot";
import { BallotDisclosure } from "@/components/proposalVoting/ballotDisclosure";
import { BallotSuccess } from "@/components/proposalVoting/ballotSuccess";
import { ActionButton } from "@/components/input/actionButton";
import { Disclosure } from "@/components/motion/Disclosure";
import { FluidHeight } from "@/components/motion/FluidHeight";
import styles from "./ballotExploration.module.css";

export const ballotVariants = [
  {
    id: "power",
    name: "Junto do poder de voto",
    idea: "O saldo e a forma de o usar ficam juntos. A máscara é uma escolha independente, abaixo do voto.",
    gain: "A relação entre saldo e randomização é imediata.",
    cost: "Continua a mostrar duas preferências antes de votar.",
    recommended: true,
  },
  {
    id: "power-settings",
    name: "Poder de voto expansível",
    idea: "O saldo mostra a percentagem em uso. A randomização abre no próprio bloco, só quando é preciso alterar.",
    gain: "Mantém o contexto, com menos elementos sempre abertos.",
    cost: "Alterar a randomização exige abrir a linha.",
    recommended: true,
  },
  {
    id: "choice-first",
    name: "Primeiro, a decisão",
    idea: "Yes / No / Abstain aparecem primeiro. O poder de voto e as preferências seguem a escolha.",
    gain: "A tarefa principal é o primeiro elemento que se vê.",
    cost: "O saldo deixa de ser visível antes da escolha.",
    recommended: false,
  },
  {
    id: "preferences",
    name: "Preferências agrupadas",
    idea: "Randomização e máscara ficam numa única secção de privacidade, com um resumo visível quando está fechada.",
    gain: "O cartão fica mais curto e mantém todas as opções no mesmo lugar.",
    cost: "A máscara fica menos evidente para quem chega pela primeira vez.",
    recommended: false,
  },
  {
    id: "review",
    name: "Configurar na revisão",
    idea: "O cartão serve para escolher. A confirmação apresenta o peso exato, a randomização e a opção de juntar uma máscara.",
    gain: "É o ponto de entrada mais simples.",
    cost: "A decisão sobre privacidade acontece um passo mais tarde.",
    recommended: true,
  },
  {
    id: "progressive",
    name: "Revelar após escolher",
    idea: "O cartão começa com as opções. Escolher uma revela o saldo, a randomização e a máscara, mantendo a escolha visível.",
    gain: "Mostra os detalhes quando passam a ser relevantes.",
    cost: "O cartão cresce durante a interação.",
    recommended: false,
  },
  {
    id: "steps",
    name: "Duas etapas no cartão",
    idea: "Escolha e revisão partilham o mesmo cartão. Na segunda etapa aparecem o peso e as opções de privacidade.",
    gain: "Uma tarefa de cada vez, sem abrir um diálogo.",
    cost: "Comparar as opções outra vez implica voltar atrás.",
    recommended: false,
  },
  {
    id: "separate",
    name: "Voto e preferências separados",
    idea: "O voto tem o seu próprio cartão; poder de voto, randomização e máscara vivem num segundo bloco.",
    gain: "Distingue bem a decisão das preferências de envio.",
    cost: "Ocupa mais espaço e em mobile volta a formar uma coluna longa.",
    recommended: false,
  },
] as const;

export type BallotVariant = (typeof ballotVariants)[number]["id"];
const options = ["Yes", "No", "Abstain"];

/** Local compositions of the real ballot primitives. No wallet, signing or submission calls. */
export function BallotExploration({ variant, changingVote }: { variant: BallotVariant; changingVote: boolean }) {
  const [choice, setChoice] = useState<number | null>(changingVote ? 0 : null);
  const [randomize, setRandomize] = useState(true);
  const [mask, setMask] = useState(false);
  const [review, setReview] = useState(false);
  const [maskOnly, setMaskOnly] = useState(false);
  const [step, setStep] = useState<"choice" | "review">("choice");
  const [receipt, setReceipt] = useState<string>();
  const [currentVote, setCurrentVote] = useState<number | null>(changingVote ? 0 : null);
  const trigger = useRef<HTMLElement | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      (step === "review" ? backButton : nextButton).current?.focus({ preventScroll: true });
      previousStep.current = step;
    }
  }, [step]);
  const id = useId();
  const editing = currentVote !== null;
  const title = editing ? "Change your vote" : "Cast ballot";
  const share = randomize ? "99–100%" : "100%";
  // Fixed illustrative quote keeps the layouts directly comparable. The live flow uses secure randomness.
  const counted = randomize ? "49,750 FOLD" : "50,000 FOLD";
  const hasVote = choice !== null;
  const primaryText = hasVote
    ? mask
      ? "Review vote + mask"
      : "Review vote"
    : mask
      ? "Review mask"
      : "Choose an option";

  const weightSetting = (suffix: string) => (
    <BallotOptionalAction
      id={`${id}-weight-${suffix}`}
      layout="row"
      title="Randomize voting power"
      description="Use 99–100% to help protect your privacy."
      checked={randomize}
      onChange={setRandomize}
    />
  );
  const maskSetting = (suffix: string) => (
    <BallotOptionalAction
      id={`${id}-mask-${suffix}`}
      layout="row"
      title="Also send a mask"
      description="Add cover for voters. No extra voting power."
      checked={mask}
      onChange={setMask}
    />
  );
  const power = (
    <div className="ballot-voting-power">
      <span className="ui-label-with-info">
        <span>Your voting power</span>
        <PowerInfo label="About your voting power for this proposal" compact={true}>
          <p>Only your voting power at the proposal’s snapshot counts for this vote.</p>
        </PowerInfo>
      </span>
      <strong>50.00K FOLD</strong>
    </div>
  );
  const powerSettings = (
    <section className={styles.stack} aria-label="Voting power settings">
      {power}
      {weightSetting("power")}
    </section>
  );
  const choices = (
    <BallotChoices
      options={options}
      value={choice}
      currentVote={currentVote}
      onChange={(next) => {
        if (typeof next === "number") setChoice(next);
      }}
    />
  );
  const summary = (
    <div className="ballot-review-summary" aria-live="polite">
      {hasVote && !maskOnly && (
        <>
          <div className="ballot-review-row">
            <span>Counted in this vote</span>
            <strong>{counted}</strong>
          </div>
          <div className="ballot-review-row">
            <span>Share of voting power</span>
            <strong>{randomize ? "99.50%" : "100%"}</strong>
          </div>
        </>
      )}
      {(mask || maskOnly) && (
        <div className="ballot-review-row">
          <span>Mask recipient</span>
          <strong>Random eligible voter</strong>
        </div>
      )}
      <div className="ballot-review-row">
        <span>Submissions</span>
        <strong>{hasVote && mask && !maskOnly ? "2 · vote, then mask" : "1"}</strong>
      </div>
    </div>
  );
  const completePreview = () => {
    setReceipt(
      maskOnly || !hasVote ? "Mask preview complete" : mask ? "Vote + mask preview complete" : "Vote preview complete"
    );
    if (!maskOnly && hasVote) setCurrentVote(choice);
    setReview(false);
    setStep("choice");
  };
  const openReview = (source: HTMLElement, onlyMask = false) => {
    trigger.current = source;
    setMaskOnly(onlyMask || !hasVote);
    setReview(true);
  };
  const standaloneMask = (
    <button
      className="vp-foot-note vp-mode-toggle"
      type="button"
      onClick={(event) => openReview(event.currentTarget, true)}
    >
      Send a mask without voting
    </button>
  );
  const primary = (
    <ActionButton
      ref={nextButton}
      intent={hasVote ? "vote" : "confirm"}
      disabled={!hasVote && !mask}
      onClick={(event) => {
        if (variant === "steps" && hasVote) {
          setMaskOnly(false);
          setStep("review");
        } else openReview(event.currentTarget);
      }}
    >
      {primaryText}
    </ActionButton>
  );
  const details = (
    <BallotDisclosure title="Voting details & activity">
      <div className={styles.stack}>
        <p className="vp-note">
          You can change your vote before voting closes. Your latest vote replaces the previous one.
        </p>
        <p className="vp-note">
          Ballots are encrypted on your device and tallied under encryption. Masks do not change any votes.
        </p>
        <p className="vp-note">No ballot activity in this preview.</p>
      </div>
    </BallotDisclosure>
  );
  const panel = (
    <BallotPanel
      title={variant === "steps" && step === "review" ? "Review your vote" : title}
      info={<BallotSubmissionInfo submitOnChain={false} />}
    >
      <FluidHeight animate={variant === "steps"}>
        <div className="vp-body">
          {receipt ? (
            <>
              <BallotSuccess title={receipt} txHash={null}>
                Simulation only. Nothing was sent.
              </BallotSuccess>
              <ActionButton
                onClick={() => {
                  setReceipt(undefined);
                  setMask(false);
                }}
              >
                Try another choice
              </ActionButton>
            </>
          ) : variant === "steps" && step === "review" ? (
            <>
              <button ref={backButton} type="button" className="vp-mode-toggle" onClick={() => setStep("choice")}>
                ← Back to your choice
              </button>
              <div className="ballot-review-row">
                <span>Your vote</span>
                <strong>{options[choice!]}</strong>
              </div>
              {summary}
              {weightSetting("step")}
              {maskSetting("step")}
              <ActionButton intent="vote" onClick={completePreview}>
                Confirm preview
              </ActionButton>
            </>
          ) : (
            <>
              {variant === "power" && powerSettings}
              {variant === "power-settings" && (
                <section className={styles.stack} aria-label="Voting power settings">
                  {power}
                  <BallotDisclosure title={`${share} of voting power · Settings`}>
                    {weightSetting("disclosure")}
                  </BallotDisclosure>
                </section>
              )}
              {["preferences", "review", "steps"].includes(variant) && power}
              {variant === "review" && <p className="vp-note">Using {share} of your power. Adjust at review.</p>}
              {choices}
              {variant === "choice-first" && powerSettings}
              {["power", "power-settings", "choice-first"].includes(variant) && maskSetting("main")}
              {variant === "preferences" && (
                <BallotDisclosure title={`Privacy · ${share} power${mask ? " + mask" : ""}`}>
                  <div className={styles.stack}>
                    {weightSetting("privacy")}
                    {maskSetting("privacy")}
                  </div>
                </BallotDisclosure>
              )}
              {variant === "progressive" && (
                <Disclosure open={hasVote}>
                  <div className={styles.stack}>
                    {powerSettings}
                    {maskSetting("progressive")}
                  </div>
                </Disclosure>
              )}
              {variant === "separate" && (
                <p className="vp-note">
                  Using {share} of your voting power{mask ? " · Mask included" : ""}.
                </p>
              )}
              {primary}
              {standaloneMask}
              {details}
            </>
          )}
        </div>
      </FluidHeight>
    </BallotPanel>
  );

  return (
    <>
      <div className={variant === "separate" ? styles.split : styles.single}>
        <div className="proposal-detail-ballot">{panel}</div>
        {variant === "separate" && !receipt && (
          <div className="proposal-detail-ballot">
            <BallotPanel title="Voting preferences">
              <div className="vp-body">
                {powerSettings}
                {maskSetting("aside")}
              </div>
            </BallotPanel>
          </div>
        )}
      </div>
      <BallotReview
        open={review}
        pending={false}
        triggerRef={trigger}
        onClose={() => setReview(false)}
        choice={maskOnly ? "Mask" : options[choice ?? 0]}
        optionIndex={choice ?? 0}
        isMask={maskOnly}
        proposalTitle="Proposal preview"
        votingPower={power}
      >
        <div className={styles.stack}>
          {!maskOnly && weightSetting("review")}
          {!maskOnly && maskSetting("review")}
          {summary}
          <p className="vp-note">Illustrative amounts. This preview does not sign or send anything.</p>
          <ActionButton intent={maskOnly ? "confirm" : "vote"} onClick={completePreview}>
            Confirm preview
          </ActionButton>
        </div>
      </BallotReview>
    </>
  );
}
