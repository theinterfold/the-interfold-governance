import { BallotDisclosure } from "@/components/proposalVoting/ballotDisclosure";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { PUB_CHAIN } from "@/constants";
import { ArrowDown, CodeBlock, Eye } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { DEMO_WALLET, previewAddress } from "./previewMode";
import styles from "./signingExploration.module.css";
import entryStyles from "./signatureOptions.module.css";

export const signingVariants = [
  {
    id: "summary",
    name: "Resumo + detalhes",
    idea: "Uma explicação curta na revisão. Os identificadores completos ficam a um toque de distância.",
    tradeoff: "Mantém o voto em primeiro plano, mas depende de a pessoa abrir os detalhes.",
  },
  {
    id: "sequence",
    name: "O que acontece a seguir",
    idea: "Separa o que mostramos, o que a wallet pede e o envio posterior da máscara.",
    tradeoff: "Explica melhor a sequência; acrescenta altura à revisão.",
  },
  {
    id: "sequence-inline",
    name: "Dados dentro do passo 01",
    idea: "A mesma sequência, com Signature data a abrir dentro do passo em que assinas o voto.",
    tradeoff: "Liga os dados diretamente à assinatura; o primeiro passo cresce quando é aberto.",
  },
] as const;

export type SigningVariant = (typeof signingVariants)[number]["id"];

export const stepNumberStyles = [
  { id: "stacked", name: "Número por cima", idea: "01 numa linha própria, antes do título." },
  { id: "inline-light", name: "Em linha · leve", idea: "01. ao lado do título, com menos peso e contraste." },
  { id: "inline-small", name: "Em linha · pequeno", idea: "01. ao lado do título, pequeno e monoespaçado." },
  {
    id: "inline-tight",
    name: "Em linha · junto",
    idea: "01. encostado ao título, com a descrição alinhada ao número.",
  },
] as const;

export type StepNumberStyle = (typeof stepNumberStyles)[number]["id"];

const verifier = previewAddress(0xc0123);
const commitment = `0x${"a7".repeat(32)}`;
const ballotPayload = {
  domain: { name: "CRISP", version: "1", chainId: PUB_CHAIN.id, verifyingContract: verifier },
  types: {
    Ballot: [
      { name: "e3Id", type: "uint256" },
      { name: "slot", type: "address" },
      { name: "ciphertextCommitment", type: "bytes32" },
    ],
  },
  primaryType: "Ballot",
  message: { e3Id: "1", slot: DEMO_WALLET, ciphertextCommitment: commitment },
};

export function SignatureReviewEntryContent() {
  return <>
    <CodeBlock size={18} aria-hidden="true" />
    <span className={entryStyles.entryCopy}>
      <span className={entryStyles.techCaps}>Signature data</span>
      <span className={entryStyles.inspectorMeta}>EIP-712<span className={entryStyles.entryNetwork}> · {PUB_CHAIN.name}</span></span>
    </span>
    <span className={entryStyles.entryView}>View</span><Eye size={18} aria-hidden="true" />
  </>;
}

export function SignatureData({ full = false }: { full?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(true);
  const updateScrollPosition = (element: HTMLDivElement) => {
    setHasMoreBelow(element.scrollTop + element.clientHeight < element.scrollHeight - 4);
  };
  const scrollToEnd = () => {
    const element = scrollRef.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollTo({
      top: element.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return (
    <div className={`${styles.codeWindow}${full ? ` ${styles.codeWindowFull}` : ""}`}>
      <div
        ref={scrollRef}
        className={styles.codeWindowBody}
        role="region"
        aria-label="Signature data"
        tabIndex={0}
        onScroll={(event) => updateScrollPosition(event.currentTarget)}
      >
        <pre>
          <code>{JSON.stringify(ballotPayload, null, 2)}</code>
        </pre>
        <dl className={styles.codeNotes}>
          <div>
            <dt>verifyingContract</dt>
            <dd>The CRISP program named as the signature verifier.</dd>
          </div>
          <div>
            <dt>e3Id</dt>
            <dd>The encrypted voting round.</dd>
          </div>
          <div>
            <dt>slot</dt>
            <dd>The ballot slot this vote is bound to.</dd>
          </div>
          <div>
            <dt>ciphertextCommitment</dt>
            <dd>Binds the encrypted ballot; the hash does not reveal the choice or amount.</dd>
          </div>
        </dl>
      </div>
      {!full && hasMoreBelow && (
        <button
          className={styles.scrollEnd}
          type="button"
          onClick={scrollToEnd}
          aria-label="Scroll to end of signature data"
        >
          Scroll to end
          <ArrowDown size={13} weight="regular" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const signatureDataTitle = (
  <span className={styles.codeDisclosureLabel}>
    <CodeBlock size={18} weight="regular" aria-hidden="true" />
    Signature data
    <span>EIP-712</span>
  </span>
);

export function SignatureDisclosure({ onOpenChange, full = false, reveal = false }: { onOpenChange?: (open: boolean) => void; full?: boolean; reveal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || !reveal) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => {
      const target = ref.current;
      const body = target?.closest<HTMLElement>(".ballot-review-body");
      if (target && body) body.scrollTo({ top: body.scrollTop + target.getBoundingClientRect().top - body.getBoundingClientRect().top, behavior: reduced ? "auto" : "smooth" });
    }, reduced ? 0 : 340);
    return () => clearTimeout(timer);
  }, [open, reveal]);
  return (
    <div ref={ref} className={styles.integratedCodeDisclosure}>
      <BallotDisclosure title={signatureDataTitle} onOpenChange={value => { setOpen(value); onOpenChange?.(value); }}>
        <SignatureData full={full} />
      </BallotDisclosure>
    </div>
  );
}

export function SigningSteps({
  numberStyle,
  switchWallet,
  includeMask = true,
  includeVote = true,
  dataInFirstStep = false,
  explanationStyle = "help",
}: {
  numberStyle: StepNumberStyle;
  switchWallet: boolean;
  includeMask?: boolean;
  includeVote?: boolean;
  dataInFirstStep?: boolean;
  explanationStyle?: "help" | "inline" | "intro";
}) {
  const steps = !includeVote
    ? [{ title: "Send the mask", description: "Adds cover without casting or changing a vote." }]
    : switchWallet
    ? [
        {
          title: "Sign your encrypted vote",
          description: "Check the signing data in your voting wallet. This prepares the ballot; nothing is sent yet.",
        },
        {
          title: "Switch to a sending wallet",
          description: "This wallet pays gas. Your voting power stays with the wallet that signed.",
        },
        {
          title: "Send the signed ballot",
          description: "Confirm the transaction in the sending wallet.",
        },
        ...(includeMask
          ? [{ title: "Send the mask", description: "A separate submission adds cover without changing your vote." }]
          : []),
      ]
    : [
        {
          title: "Sign your encrypted vote",
          description: "Check the signing data in your wallet before approving. The encrypted vote is then submitted.",
        },
        ...(includeMask
          ? [{ title: "Send the mask", description: "A separate submission adds cover without changing your vote." }]
          : []),
      ];

  return (
    <div>
      {explanationStyle === "intro" && <p className={styles.sequenceIntro}>
        {switchWallet
          ? `Sign with your voting wallet, then switch wallets to send your vote${includeMask ? " and mask" : ""}.`
          : !includeVote ? "Send a mask without casting or changing a vote." : `Sign with your voting wallet to submit your encrypted vote.${includeMask ? " The mask follows in a separate submission." : ""}`}
      </p>}
    <ol className={styles.sequence} data-number-style={numberStyle} data-explanation={explanationStyle}>
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className={styles.stepNumber} aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
            {numberStyle === "stacked" ? "" : "."}
          </span>
          <div className={styles.stepTitle}>
            <strong>{explanationStyle === "help" ? step.title : step.title === "Switch to a sending wallet" ? "Switch wallet" : step.title === "Send the signed ballot" ? "Send your vote" : step.title}</strong>
            {explanationStyle === "help" ? <PowerInfo label={`About ${step.title.toLowerCase()}`} compact>
              {step.description}
            </PowerInfo> : explanationStyle === "inline" ? <span className={styles.stepInlineText}>{step.title === "Sign your encrypted vote" ? switchWallet ? "Prepare the ballot." : "Sign and submit the ballot." : step.title === "Switch to a sending wallet" ? "Choose the wallet that pays gas." : step.title === "Send the signed ballot" ? "Submit the signed ballot." : includeVote ? "Add cover in a separate submission." : "Add cover without changing any vote."}</span> : null}
          </div>
          {index === 0 && dataInFirstStep && (
            <div className={styles.stepDetail}>
              <SignatureDisclosure />
            </div>
          )}
        </li>
      ))}
    </ol>
    </div>
  );
}

export function SigningExplanation({
  variant,
  numberStyle = "inline-small",
  switchWallet = false,
  includeMask = true,
  flush = false,
  onSignatureOpenChange,
}: {
  variant: SigningVariant;
  numberStyle?: StepNumberStyle;
  switchWallet?: boolean;
  includeMask?: boolean;
  flush?: boolean;
  onSignatureOpenChange?: (open: boolean) => void;
}) {
  if (variant === "summary")
    return (
      <section
        className={`${styles.explanation}${flush ? ` ${styles.explanationFlush}` : ""}`}
        aria-label="Before you sign"
      >
        <div className="ui-info-note" role="note">
          <p>
            <strong>Before your wallet opens</strong>
            <br />
            You’re changing your vote from No to Abstain with 49,750 FOLD. Your wallet will ask you to sign an encrypted
            ballot for this round. {switchWallet ? "You’ll then switch wallets to send it. " : ""}
            {includeMask ? "The mask is a separate submission. " : ""}Check the signature data against your wallet
            request.
          </p>
        </div>
        <SignatureDisclosure />
      </section>
    );

  const dataInFirstStep = variant === "sequence-inline";
  return (
    <section
      className={`${styles.explanation}${flush ? ` ${styles.explanationFlush}` : ""}`}
      aria-label="Signing sequence"
    >
      <SigningSteps
        numberStyle={numberStyle}
        switchWallet={switchWallet}
        includeMask={includeMask}
        dataInFirstStep={dataInFirstStep}
      />
      {!dataInFirstStep && <SignatureDisclosure onOpenChange={onSignatureOpenChange} full={!!onSignatureOpenChange} reveal={!!onSignatureOpenChange} />}
    </section>
  );
}
