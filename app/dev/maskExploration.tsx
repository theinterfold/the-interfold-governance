import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ActionButton } from "@/components/input/actionButton";
import { BallotWalletSummary } from "@/components/proposalVoting/ballotWalletSummary";
import { ChoiceMenu } from "@/components/input/choiceMenu";
import { ActionIcon } from "@/components/input/actionIcon";
import { SegmentedControl } from "@/components/input/segmentedControl";
import { AnimatedAmount } from "@/components/motion/AnimatedAmount";
import { Disclosure } from "@/components/motion/Disclosure";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import {
  BallotChoices,
  BallotOptionalAction,
  BallotPanel,
  BallotReview,
  BallotSubmissionInfo,
  MaskIcon,
  ballotOptionColor,
  type BallotChoicePresentation,
} from "@/components/proposalVoting/ballot";
import { BallotDisclosure } from "@/components/proposalVoting/ballotDisclosure";
import { BallotSuccess } from "@/components/proposalVoting/ballotSuccess";
import { BallotEligibilityNotice } from "@/components/proposalVoting/ballotEligibility";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { PowerWarning } from "@/plugins/velocker/components/powerWarning";
import { CaretDown, Info, LockSimple, Percent } from "@phosphor-icons/react";
import { useAccount } from "wagmi";
import { openDemoWalletPanel, setDemoWalletReturnFocus } from "./DemoWalletPanel";
import { DEMO_SENDING_WALLET } from "./demoWalletSession";
import { DESIGN_PREVIEW, DEMO_WALLET } from "./previewMode";
import { demoState, prepareDemoBallot, sendPreparedDemoBallot, simulateDemoBallot } from "./simulation";
import type { Address } from "viem";
import eligibleVoterExamples from "./snapshots/eligible-voters-demo.json";
import styles from "./ballotExploration.module.css";
import { CipherTitle } from "./cipherTitle";
import { BendingChevron } from "@/vendor/site-header";
import { voteChoiceVariants } from "./voteChoiceVariants";
import { SigningSteps, SignatureData, SignatureReviewEntryContent } from "./signingExploration";
import signatureStyles from "./signatureOptions.module.css";

export const maskVariants = [
  {
    id: "paths",
    name: "Ballot / Mask",
    idea: "Ballot / Mask no topo. No voto, primeiro o poder e a escolha; a revisão reúne Add a mask, Send from another wallet e Randomize voting power.",
    gain: "O formulário fica curto e as três ferramentas de privacidade aparecem juntas no momento da revisão.",
    cost: "Com outra wallet e máscara, o voto é enviado primeiro. O protótipo mostra a troca de wallet e depois o envio separado da máscara.",
    recommended: true,
  },
  {
    id: "compose",
    name: "Voto primeiro, máscara opcional",
    idea: "Escolher Yes, No ou Abstain já indica que queres votar. A máscara é opcional e oferece Add mask ou Just mask.",
    gain: "Não há um controlo extra para ativar o voto. Escolher uma opção de voto passa automaticamente de Just mask para Add mask.",
    cost: "Em Just mask, as opções ficam por selecionar. O voto já submetido mantém a indicação Current vote.",
    recommended: true,
  },
  {
    id: "privacy",
    name: "Tudo em Privacy",
    idea: "Privacy reúne o poder de voto e um menu Mask com No mask / Add to vote / Mask only. O botão principal acompanha a combinação.",
    gain: "Testa a hipótese de juntar tudo sem deixar Just mask de fora. Há uma única entrada para as preferências.",
    cost: "Só máscara está dentro de uma secção fechada: é menos fácil de descobrir.",
    recommended: true,
  },
  {
    id: "mask-menu",
    name: "Uma entrada para a máscara",
    idea: "Uma única entrada Mask abre as escolhas Add to my vote e Mask only. Depois, o cartão mostra o que vai ser enviado.",
    gain: "A máscara tem um ponto de entrada próprio e não aparece duas vezes como checkbox e link.",
    cost: "Configurar a máscara abre um painel antes da revisão final.",
    recommended: false,
  },
] as const;

export type MaskVariant = (typeof maskVariants)[number]["id"];
type MaskIntent = "none" | "with-vote" | "only";
type RecipientMode = "random" | "self" | "address";
type PrivacyToolId = "random" | "mask" | "wallet";
type PrivacySymbolCapture = { tool: PrivacyToolId; rect: DOMRect; icon: SVGElement; color: string };
type PreparedPreview = {
  choice: number;
  countedAmount: string;
  countedPercent: string;
  mask: boolean;
  recipient: string;
  recipientAddress?: string;
  voter: Address;
};
type BallotDraft = {
  includeVote: boolean;
  includeMask: boolean;
  pathSection: "ballot" | "mask";
  recipientMode: RecipientMode;
  recipientAddress: string;
  sendWithAnotherWallet: boolean;
  choice: number | null;
  currentVote: number | null;
  randomize: boolean;
  receipt?: string;
  prepared: PreparedPreview | null;
  maskStep: boolean;
  ballotMask: boolean;
};
const ballotDrafts = new Map<string, BallotDraft>();
const voteOptions = ["Yes", "No", "Abstain"];
const privacyToolIds: PrivacyToolId[] = ["random", "mask", "wallet"];
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const exampleRecipients = eligibleVoterExamples.voters.slice(0, 3).map(({ address }) => ({
  value: address,
  label: `${address.slice(0, 8)}…${address.slice(-4)}`,
}));

function PrivacyIconToggle({
  tool,
  label,
  description,
  icon,
  checked,
  disabled,
  onToggle,
}: {
  tool: PrivacyToolId;
  label: string;
  description: string;
  icon: ReactNode;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild={true}>
        <button
          type="button"
          className={styles.privacyToolsIconButton}
          data-privacy-toggle={tool}
          data-active={checked}
          aria-label={label}
          aria-pressed={checked}
          disabled={disabled}
          onClick={onToggle}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={8}
          collisionPadding={16}
          className={`power-info-popover power-info-popover--compact ${styles.privacyToolsTooltip}`}
        >
          <strong>{label}</strong>
          <p>{description}</p>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function SubmissionSteps({ steps, current }: { steps: string[]; current: number }) {
  if (steps.length < 2) return null;
  return (
    <nav className={styles.submissionSteps} aria-label="Submission steps">
      <span className="sr-only">
        Step {current + 1} of {steps.length}: {steps[current]}
      </span>
      <ol>
        {steps.map((step, index) => (
          <li
            key={step}
            data-state={index < current ? "complete" : index === current ? "current" : "upcoming"}
            aria-current={index === current ? "step" : undefined}
          >
            <span className={styles.submissionStepNumber} aria-hidden="true">
              {index < current ? <ActionIcon name="check" /> : index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Interaction study only: composes the live controls without calling any wallet or submission service. */
export function MaskExploration({
  variant,
  changingVote,
  inSite = false,
  votePresentation,
  proposalId = 1n,
  canVote,
  eligibilityNotice,
}: {
  variant: MaskVariant;
  changingVote: boolean;
  inSite?: boolean;
  votePresentation?: BallotChoicePresentation;
  proposalId?: bigint;
  canVote?: boolean;
  eligibilityNotice?: ReactNode;
}) {
  const interactiveDemo = inSite && DESIGN_PREVIEW;
  const draftKey = `${proposalId}-${DEMO_WALLET.toLowerCase()}`;
  const savedDraft = useRef(interactiveDemo ? ballotDrafts.get(draftKey) : undefined);
  const [includeVote, setIncludeVote] = useState(savedDraft.current?.includeVote ?? true);
  const [includeMask, setIncludeMask] = useState(savedDraft.current?.includeMask ?? false);
  const [pathSection, setPathSection] = useState<"ballot" | "mask">(savedDraft.current?.pathSection ?? "ballot");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>(savedDraft.current?.recipientMode ?? "random");
  const [recipientAddress, setRecipientAddress] = useState(
    savedDraft.current?.recipientAddress ?? exampleRecipients[0].value
  );
  const [sendWithAnotherWallet, setSendWithAnotherWallet] = useState(
    savedDraft.current?.sendWithAnotherWallet ?? false
  );
  const [choice, setChoice] = useState<number | null>(savedDraft.current?.choice ?? (changingVote ? 0 : null));
  const [currentVote, setCurrentVote] = useState<number | null>(
    () =>
      savedDraft.current?.currentVote ??
      (interactiveDemo ? (demoState().votes[`private:${proposalId}`] ?? null) : changingVote ? 0 : null)
  );
  const [randomize, setRandomize] = useState(savedDraft.current?.randomize ?? true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewClosing, setReviewClosing] = useState(false);
  const reviewOriginTitle = useRef("Cast ballot");
  const reviewOriginLabel = useRef("Review vote");
  const [signatureExpanded, setSignatureExpanded] = useState(false);
  const signatureTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!reviewOpen) setSignatureExpanded(false);
  }, [reviewOpen]);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacyPresentation, setPrivacyPresentation] = useState<"icons" | "classic">("icons");
  const [siteVotePresentation, setSiteVotePresentation] = useState<BallotChoicePresentation>(
    inSite ? "framed" : "current"
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [receipt, setReceipt] = useState<string | undefined>(savedDraft.current?.receipt);
  const lastReceipt = useRef(receipt);
  if (receipt) lastReceipt.current = receipt;
  const [prepared, setPrepared] = useState<PreparedPreview | null>(savedDraft.current?.prepared ?? null);
  const [maskStep, setMaskStep] = useState(savedDraft.current?.maskStep ?? false);
  const { address, isConnected } = useAccount();
  const walletAvailable = !interactiveDemo || (isConnected && !!address);
  const [pendingStep, setPendingStep] = useState<"prepare" | "vote" | "mask" | null>(null);
  const [sendingWalletChangeOpen, setSendingWalletChangeOpen] = useState(false);
  const [flowError, setFlowError] = useState("");
  const processing = useRef(false);
  const mounted = useRef(true);
  const ballotRef = useRef<HTMLDivElement>(null);
  const ballotFocus = useRef<HTMLSpanElement>(null);
  const preparedFocus = useRef<HTMLSpanElement>(null);
  const maskFocus = useRef<HTMLSpanElement>(null);
  const sendAction = useRef<HTMLButtonElement>(null);
  const maskAction = useRef<HTMLButtonElement>(null);
  const reviewAction = useRef<HTMLButtonElement>(null);
  const lastPrepared = useRef(prepared);
  if (prepared) lastPrepared.current = prepared;
  const shownPrepared = prepared ?? lastPrepared.current;
  const pending = pendingStep !== null;
  const reviewTrigger = useRef<HTMLElement | null>(null);
  const pickerTrigger = useRef<HTMLElement | null>(null);
  const resultAction = useRef<HTMLButtonElement>(null);
  const ballotMaskBeforeSwitch = useRef(savedDraft.current?.ballotMask ?? false);
  const randomizeChanged = useRef(false);
  const privacySectionRef = useRef<HTMLElement>(null);
  const pendingPrivacyFlight = useRef<{ open: boolean; from: PrivacySymbolCapture[] } | null>(null);
  const privacyFlight = useRef<{ nodes: SVGElement[]; animations: Animation[] } | null>(null);
  const id = useId();
  const activeVotePresentation = votePresentation ?? siteVotePresentation;
  const onlyMask = !includeVote && includeMask;
  const valid = includeVote ? choice !== null : includeMask;
  const votingWalletConnected =
    !interactiveDemo || (walletAvailable && canVote === true && address?.toLowerCase() === DEMO_WALLET.toLowerCase());
  const reviewAccount = useRef(address);
  useEffect(() => {
    if (!interactiveDemo) return;
    if (!walletAvailable || reviewAccount.current?.toLowerCase() !== address?.toLowerCase()) {
      setReviewOpen(false);
      setPickerOpen(false);
    }
    reviewAccount.current = address;
  }, [interactiveDemo, walletAvailable, address]);
  const maskIntent: MaskIntent = onlyMask ? "only" : includeMask ? "with-vote" : "none";
  const submissionSteps = [
    ...(includeVote && sendWithAnotherWallet ? ["Prepare vote"] : []),
    ...(includeVote ? ["Send vote"] : []),
    ...(includeMask ? ["Send mask"] : []),
  ];
  const share = randomize ? "99–100%" : "100%";
  const privacySummary = onlyMask ? "Mask only" : `${share} power${includeMask ? " + mask" : ""}`;
  const sentDescription = includeVote
    ? includeMask
      ? "Your vote + one mask"
      : "Your vote only"
    : includeMask
      ? "One mask · no vote"
      : "Choose a vote, a mask, or both";
  const unchangedVote =
    currentVote === null ? "No vote will be cast." : `Your current ${voteOptions[currentVote]} vote stays unchanged.`;
  const reviewExplanation = includeVote
    ? [
        randomize
          ? "This ballot uses the randomized voting power shown above."
          : "This ballot uses the voting power shown above.",
        sendWithAnotherWallet ? "Prepare it here, then switch wallets to send it." : null,
        includeMask ? "The mask follows as a separate submission." : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "This mask adds cover without casting or changing a vote. It has no voting power.";

  useEffect(() => {
    if (reviewClosing) return;
    if (receipt) resultAction.current?.focus({ preventScroll: true });
    else if (prepared) (maskStep ? maskFocus.current : preparedFocus.current)?.focus({ preventScroll: true });
  }, [receipt, prepared, maskStep, reviewClosing]);
  useEffect(() => {
    if (interactiveDemo)
      ballotDrafts.set(draftKey, {
        includeVote,
        includeMask,
        pathSection,
        recipientMode,
        recipientAddress,
        sendWithAnotherWallet,
        choice,
        currentVote,
        randomize,
        receipt,
        prepared,
        maskStep,
        ballotMask: ballotMaskBeforeSwitch.current,
      });
  }, [
    interactiveDemo,
    draftKey,
    includeVote,
    includeMask,
    pathSection,
    recipientMode,
    recipientAddress,
    sendWithAnotherWallet,
    choice,
    currentVote,
    randomize,
    receipt,
    prepared,
    maskStep,
  ]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const classic = new URLSearchParams(window.location.search).get("privacy") === "classic";
    setPrivacyPresentation(classic ? "classic" : "icons");
  }, []);

  useEffect(() => {
    if (!inSite || !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) return;
    const requested = new URLSearchParams(window.location.search).get("voteStyle");
    const variant = voteChoiceVariants.find(({ id }) => id === requested);
    if (variant) setSiteVotePresentation(variant.id);
  }, [inSite]);

  const selectMaskIntent = (next: MaskIntent) => {
    setIncludeVote(next !== "only");
    setIncludeMask(next !== "none");
  };
  const setMaskTool = (checked: boolean) => {
    if (checked) setRecipientMode("random");
    setIncludeMask(checked);
    ballotMaskBeforeSwitch.current = checked;
  };
  const changeRandomize = (checked: boolean) => {
    randomizeChanged.current = true;
    setRandomize(checked);
  };
  const clearPrivacyFlight = () => {
    pendingPrivacyFlight.current = null;
    privacyFlight.current?.animations.forEach((animation) => animation.cancel());
    privacyFlight.current?.nodes.forEach((node) => node.remove());
    privacyFlight.current = null;
    privacySectionRef.current?.removeAttribute("data-symbol-moving");
  };
  const togglePrivacyDetails = () => {
    const nextOpen = !privacyOpen;
    const section = privacySectionRef.current;
    if (privacyPresentation !== "icons" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !section) {
      clearPrivacyFlight();
      section?.removeAttribute("data-symbol-moving");
      setPrivacyOpen(nextOpen);
      return;
    }
    const from = privacyToolIds.flatMap((tool): PrivacySymbolCapture[] => {
      const floating = privacyFlight.current?.nodes.find((node) => node.dataset.privacyFlightTool === tool);
      const source =
        floating ??
        section.querySelector<SVGElement>(
          nextOpen ? `[data-privacy-toggle="${tool}"] > svg` : `[data-privacy-detail-icon="${tool}"] svg`
        );
      if (!source) return [];
      return [
        {
          tool,
          rect: source.getBoundingClientRect(),
          icon: source.cloneNode(true) as SVGElement,
          color: getComputedStyle(source).color,
        },
      ];
    });
    clearPrivacyFlight();
    pendingPrivacyFlight.current = { open: nextOpen, from };
    // The disclosure clips its contents, so keep one visible copy above it during the move.
    section.setAttribute("data-symbol-moving", "true");
    setPrivacyOpen(nextOpen);
  };

  useClientLayoutEffect(() => {
    const pending = pendingPrivacyFlight.current;
    if (!pending || pending.open !== privacyOpen) return;
    pendingPrivacyFlight.current = null;
    const section = privacySectionRef.current;
    if (!section) return;
    const sectionStyle = getComputedStyle(section);
    const duration = parseFloat(sectionStyle.getPropertyValue("--interfold-ui-duration")) || 320;
    const easing = sectionStyle.getPropertyValue("--interfold-ui-ease").trim() || "cubic-bezier(0.22, 1, 0.36, 1)";
    const nodes: SVGElement[] = [];
    const animations: Animation[] = [];
    for (const source of pending.from) {
      const target = section.querySelector<SVGElement>(
        privacyOpen ? `[data-privacy-detail-icon="${source.tool}"] svg` : `[data-privacy-toggle="${source.tool}"] > svg`
      );
      if (!target || !source.rect.width || !source.rect.height) continue;
      const targetRect = target.getBoundingClientRect();
      if (!targetRect.width || !targetRect.height) continue;
      const node = source.icon;
      node.dataset.privacyFlightTool = source.tool;
      node.setAttribute("aria-hidden", "true");
      Object.assign(node.style, {
        position: "fixed",
        left: `${source.rect.left}px`,
        top: `${source.rect.top}px`,
        width: `${source.rect.width}px`,
        height: `${source.rect.height}px`,
        margin: "0",
        color: source.color,
        pointerEvents: "none",
        zIndex: "40",
        transform: "none",
        transformOrigin: "top left",
      });
      document.body.appendChild(node);
      nodes.push(node);
      animations.push(
        node.animate(
          [
            { transform: "translate(0, 0) scale(1, 1)", color: source.color },
            {
              transform: `translate(${targetRect.left - source.rect.left}px, ${targetRect.top - source.rect.top}px) scale(${targetRect.width / source.rect.width}, ${targetRect.height / source.rect.height})`,
              color: getComputedStyle(target).color,
            },
          ],
          { duration, easing, fill: "forwards" }
        )
      );
    }
    if (!animations.length) {
      section.removeAttribute("data-symbol-moving");
      return;
    }
    const flight = { nodes, animations };
    privacyFlight.current = flight;
    Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
      if (privacyFlight.current !== flight) return;
      nodes.forEach((node) => node.remove());
      privacyFlight.current = null;
      section.removeAttribute("data-symbol-moving");
    });
  }, [privacyOpen, privacyPresentation]);

  useEffect(() => {
    const settle = () => clearPrivacyFlight();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("scroll", settle, true);
    window.addEventListener("resize", settle);
    reduced.addEventListener("change", settle);
    return () => {
      window.removeEventListener("scroll", settle, true);
      window.removeEventListener("resize", settle);
      reduced.removeEventListener("change", settle);
      clearPrivacyFlight();
    };
  }, []);
  const countedPower = randomize ? "49,750 FOLD" : "50,000 FOLD";
  const appliedPercent = randomize ? "99.50%" : "100.00%";
  const powerCalculation = (
    <>
      <dl className={styles.powerCalculation}>
        <div>
          <dt>Snapshot voting power</dt>
          <dd>50,000 FOLD</dd>
        </div>
        <div>
          <dt>Share used</dt>
          <dd>{appliedPercent}</dd>
        </div>
        <div>
          <dt>Counted for this ballot</dt>
          <dd>{countedPower}</dd>
        </div>
      </dl>
      <p className={styles.powerCalculationFormula}>
        <span>50,000 FOLD</span>
        <span>× {appliedPercent}</span>
        <span>= {countedPower}</span>
      </p>
    </>
  );
  const power = (
    <div className="ballot-voting-power">
      <span className="ui-label-with-info">
        <span className={styles.powerInfoTrigger}>
          <PowerInfo contentClassName={styles.powerCalculationPopover}
            label={`Your voting power is ${appliedPercent} of the snapshot amount. Show calculation`}
            compact={true}
            trigger={
              <span className={styles.powerLabel}>
                <span
                  key={randomize ? "randomized" : "full"}
                  className={randomizeChanged.current ? "vp-label-change" : undefined}
                >
                  Your voting power
                </span>
                <span className={styles.powerPercent}>
                  <AnimatedAmount plain={true} value={appliedPercent} />
                </span>
                <Info size={16} weight="regular" aria-hidden="true" />
              </span>
            }
          >
            {powerCalculation}
          </PowerInfo>
        </span>
      </span>
      <strong className={styles.powerInfoTrigger}>
        <PowerInfo contentClassName={styles.powerCalculationPopover}
          label={`How ${countedPower} is calculated`}
          compact={true}
          trigger={<AnimatedAmount highlighted={randomize} value={countedPower} />}
        >
          {powerCalculation}
        </PowerInfo>
      </strong>
    </div>
  );
  const randomization = (
    <div className={styles.stack}>
      {power}
      <BallotOptionalAction
        id={`${id}-random`}
        layout="row"
        title="Randomize voting power"
        description="Use 99–100% to help protect your privacy."
        checked={randomize}
        onChange={changeRandomize}
      />
    </div>
  );
  const voteChoices = (
    <BallotChoices
      options={voteOptions}
      presentation={activeVotePresentation}
      value={variant === "compose" && onlyMask ? null : choice}
      currentVote={currentVote}
      onChange={(next) => {
        if (typeof next === "number") {
          setChoice(next);
          if (variant === "compose") setIncludeVote(true);
        }
      }}
    />
  );
  const presentedVoteChoices =
    activeVotePresentation === "decision" ? (
      <section className={styles.voteDecision} aria-labelledby={`${id}-vote-decision-title`}>
        <h4 id={`${id}-vote-decision-title`}>Your vote</h4>
        {voteChoices}
      </section>
    ) : (
      voteChoices
    );
  const maskExplanation = (
    <div className={styles.stack}>
      {variant === "paths" ? (
        <>
          <p className="vp-note">Adds cover without voting power. Choose the recipient in review.</p>
          {currentVote !== null && <p className="vp-note">{unchangedVote}</p>}
        </>
      ) : (
        <>
          <p className="vp-note">Add cover for eligible voters with a zero-weight ballot.</p>
          <div className="ballot-review-row">
            <span>Mask recipient</span>
            <strong>Random eligible voter</strong>
          </div>
          <p className="vp-note">{unchangedVote}</p>
        </>
      )}
    </div>
  );

  const maskRecipient = (
    <div className={styles.stack}>
      <ChoiceMenu<RecipientMode>
        label="Mask recipient"
        value={recipientMode}
        onChange={setRecipientMode}
        options={[
          { value: "random", label: "Random eligible voter" },
          { value: "self", label: "Your wallet" },
          { value: "address", label: "Another wallet" },
        ]}
      />
      {recipientMode === "self" && (
        <p className="vp-note">
          Your wallet: {DEMO_WALLET.slice(0, 8)}…{DEMO_WALLET.slice(-4)}
        </p>
      )}
      {recipientMode === "address" && (
        <ChoiceMenu<string>
          label={inSite ? "Eligible wallet" : "Eligible wallet · example"}
          value={recipientAddress}
          onChange={setRecipientAddress}
          options={exampleRecipients}
        />
      )}
    </div>
  );

  const runAction = async (step: "prepare" | "vote" | "mask", action: () => Promise<void>) => {
    if (processing.current) return;
    processing.current = true;
    if (interactiveDemo)
      setDemoWalletReturnFocus(prepared ? (maskStep ? maskAction.current : sendAction.current) : reviewAction.current);
    setPendingStep(step);
    setFlowError("");
    try {
      await action();
    } catch (error) {
      if (mounted.current) setFlowError((error as Error).message || "The request could not be completed. Try again.");
    } finally {
      processing.current = false;
      if (mounted.current) setPendingStep(null);
    }
  };
  const recipientTarget =
    recipientMode === "self" ? DEMO_WALLET : recipientMode === "address" ? recipientAddress : undefined;
  const makePrepared = (): PreparedPreview => ({
    choice: choice!,
    countedAmount: randomize ? "49,750 FOLD" : "50,000 FOLD",
    countedPercent: randomize ? "99.50%" : "100%",
    mask: includeMask,
    recipient:
      recipientMode === "self"
        ? "Your wallet"
        : recipientMode === "address"
          ? `${recipientAddress.slice(0, 8)}…${recipientAddress.slice(-4)}`
          : "Random eligible voter",
    recipientAddress: recipientTarget,
    voter: DEMO_WALLET,
  });
  const preview = async () => {
    if (!valid || pending) return;
    if (!walletAvailable) return;
    if (includeVote && !votingWalletConnected) {
      setFlowError("Connect the voting wallet to prepare this ballot.");
      return;
    }
    await runAction(sendWithAnotherWallet && includeVote ? "prepare" : onlyMask ? "mask" : "vote", async () => {
      if (variant === "paths" && includeVote && choice !== null && (sendWithAnotherWallet || includeMask)) {
        if (interactiveDemo) {
          if (sendWithAnotherWallet) await prepareDemoBallot(proposalId, BigInt(choice));
          else await simulateDemoBallot(proposalId, BigInt(choice), false, undefined, DEMO_WALLET);
        }
        if (!mounted.current) return;
        if (!sendWithAnotherWallet) setCurrentVote(choice);
        setPrepared(makePrepared());
        setMaskStep(!sendWithAnotherWallet);
        setReviewClosing(true);
        setReviewOpen(false);
        return;
      }
      if (interactiveDemo)
        await simulateDemoBallot(proposalId, BigInt(choice ?? 0), onlyMask, recipientTarget, DEMO_WALLET);
      if (!mounted.current) return;
      if (includeVote) setCurrentVote(choice);
      setReceipt(onlyMask ? "Mask sent" : includeMask ? "Vote and mask sent" : "Vote sent");
      setReviewClosing(true);
      setReviewOpen(false);
    });
  };
  const sendPrepared = async () => {
    if (!prepared || (interactiveDemo && !address) || pending) return;
    await runAction("vote", async () => {
      if (interactiveDemo) await sendPreparedDemoBallot(proposalId, BigInt(prepared.choice), prepared.voter, address!);
      if (!mounted.current) return;
      setCurrentVote(prepared.choice);
      if (prepared.mask) setMaskStep(true);
      else {
        setReceipt("Vote sent");
        setPrepared(null);
      }
    });
  };
  const sendMask = async () => {
    if (!prepared || pending || !walletAvailable) return;
    await runAction("mask", async () => {
      if (interactiveDemo) await simulateDemoBallot(proposalId, 0n, true, prepared.recipientAddress, prepared.voter);
      if (!mounted.current) return;
      setReceipt("Vote and mask sent");
      setPrepared(null);
      setMaskStep(false);
    });
  };

  if (interactiveDemo && !prepared && (!walletAvailable || (includeVote && !votingWalletConnected))) {
    return (
      <div className="ballot-preview-host">
        <BallotPanel title="Voting">
          <div className="vp-body">
            {eligibilityNotice ?? (
              <BallotEligibilityNotice connected={walletAvailable} canVote={false} votingPower={0n} />
            )}
            {walletAvailable && canVote !== undefined && (
              <ActionButton
                onClick={() => {
                  setPathSection("mask");
                  setIncludeVote(false);
                  setIncludeMask(true);
                }}
              >
                Send a mask
              </ActionButton>
            )}
          </div>
        </BallotPanel>
      </div>
    );
  }

  return (
    <>
      <div ref={ballotRef} className={inSite ? "ballot-preview-host" : "proposal-detail-ballot"}>
        <BallotPanel
          title={
            reviewClosing
              ? reviewOriginTitle.current
              : prepared
                ? maskStep
                  ? "Send your mask"
                  : "Signed ballot ready"
                : onlyMask
                  ? "Send a mask"
                  : currentVote !== null
                    ? "Change your vote"
                    : "Cast ballot"
          }
          info={<BallotSubmissionInfo submitOnChain={false} />}
        >
          <div
            className={`vp-body ${styles.ballotBody}`}
            data-privacy-open={variant === "paths" && privacyOpen && includeVote}
          >
            <FluidHeight
              layoutKey={
                reviewClosing ? "ballot" : receipt ? "success" : prepared ? (maskStep ? "mask" : "prepared") : "ballot"
              }
            >
              <div className="motion-tab-panels">
                <MotionPanel active={!!receipt && !reviewClosing} direction="right">
                  <div className={styles.stack}>
                    <BallotSuccess title={receipt ?? lastReceipt.current} txHash={null}>
                      {onlyMask ? unchangedVote : "Your encrypted ballot has been submitted."}
                    </BallotSuccess>
                    <ActionButton
                      ref={resultAction}
                      onClick={() => {
                        setReceipt(undefined);
                        setFlowError("");
                        setPathSection("ballot");
                        setIncludeVote(true);
                        setIncludeMask(false);
                        ballotMaskBeforeSwitch.current = false;
                        requestAnimationFrame(() => ballotFocus.current?.focus({ preventScroll: true }));
                      }}
                    >
                      {onlyMask && currentVote === null
                        ? "Vote on this proposal"
                        : onlyMask
                          ? "View your vote"
                          : "Back to ballot"}
                    </ActionButton>
                  </div>
                </MotionPanel>
                <MotionPanel active={!!prepared && !receipt && !reviewClosing} direction="right">
                  {shownPrepared && (
                    <div className="motion-tab-panels">
                      <MotionPanel active={maskStep} direction="right">
                        <div className={styles.stack}>
                          <span ref={maskFocus} tabIndex={-1} className="sr-only">
                            Send your mask
                          </span>
                          <SubmissionSteps steps={submissionSteps} current={submissionSteps.length - 1} />
                          <p className={styles.completedVoteNote} role="status">
                            <ActionIcon name="check" />
                            Your {voteOptions[shownPrepared.choice]} vote was sent.
                          </p>
                          <div className={styles.maskStepDetail}>
                            <div className="ballot-review-row">
                              <span>Mask recipient</span>
                              <strong>{shownPrepared.recipient}</strong>
                            </div>
                            <p className="vp-note">The mask adds cover without voting power or changing your vote.</p>
                          </div>
                          {flowError && (
                            <p className="power-field-error" role="alert">
                              {flowError} Your vote is already submitted; retrying only sends the mask.
                            </p>
                          )}
                          {!walletAvailable && (
                            <PowerWarning
                              title="Connect a wallet to send the mask"
                              action={
                                <ActionButton size="compact" affordance="wallet" onClick={openDemoWalletPanel}>
                                  Connect wallet
                                </ActionButton>
                              }
                            >
                              Your vote is already submitted. Connecting only lets you continue the mask step.
                            </PowerWarning>
                          )}
                          <ActionButton
                            ref={maskAction}
                            intent="confirm"
                            isLoading={pendingStep === "mask"}
                            disabled={pending || !walletAvailable}
                            onClick={sendMask}
                          >
                            {pendingStep === "mask" ? "Sending mask" : flowError ? "Retry mask" : "Send mask"}
                          </ActionButton>
                        </div>
                      </MotionPanel>
                      <MotionPanel active={!maskStep} direction="left">
                        <div className={styles.stack}>
                          <span ref={preparedFocus} tabIndex={-1} className="sr-only">
                            Signed ballot ready
                          </span>
                          <SubmissionSteps steps={submissionSteps} current={submissionSteps.indexOf("Send vote")} />
                          <section className={styles.preparedVoteCard} aria-label="Prepared vote">
                            <span className={styles.preparedVoteLabel}>Vote to send</span>
                            <strong className={styles.preparedVoteChoice}>
                              <span
                                style={{ background: ballotOptionColor(shownPrepared.choice) }}
                                aria-hidden="true"
                              />
                              {voteOptions[shownPrepared.choice]}
                            </strong>
                            <div className={styles.preparedVotePower}>
                              <span>Your voting power</span>
                              <strong>{shownPrepared.countedAmount}</strong>
                              <span>{shownPrepared.countedPercent}</span>
                            </div>
                          </section>
                          <div className={styles.preparedWallets}>
                            <BallotWalletSummary voter={shownPrepared.voter} sender={address} />
                          </div>
                          <p className={styles.preparedSupport}>
                            The sending wallet only pays gas. Your vote counts for the original wallet.
                          </p>
                          {(address?.toLowerCase() !== DEMO_SENDING_WALLET.toLowerCase() ||
                            sendingWalletChangeOpen) && (
                            <PowerWarning
                              title={address ? "You haven’t switched wallets yet" : "Connect a sending wallet"}
                              action={
                                <ActionButton
                                  size="compact"
                                  affordance="wallet"
                                  disabled={pending}
                                  onClick={() => {
                                    setSendingWalletChangeOpen(true);
                                    openDemoWalletPanel(sendAction.current, () => setSendingWalletChangeOpen(false));
                                  }}
                                >
                                  {walletAvailable ? "Change sending wallet" : "Connect sending wallet"}
                                </ActionButton>
                              }
                            >
                              {address
                                ? "You’re still connected to the wallet that prepared this vote. Switch to the sending wallet before continuing."
                                : "Connect the sending wallet before continuing."}
                            </PowerWarning>
                          )}
                          {flowError && (
                            <p className="power-field-error" role="alert">
                              {flowError}
                            </p>
                          )}
                          <div className="vp-cta">
                            <ActionButton
                              ref={sendAction}
                              intent="vote"
                              disabled={
                                pending ||
                                (interactiveDemo && address?.toLowerCase() !== DEMO_SENDING_WALLET.toLowerCase())
                              }
                              isLoading={pendingStep === "vote"}
                              onClick={sendPrepared}
                            >
                              {pendingStep === "vote"
                                ? "Sending signed ballot"
                                : flowError
                                  ? "Retry signed ballot"
                                  : "Send signed ballot"}
                            </ActionButton>
                            <ActionButton
                              intent="destructive"
                              disabled={pending}
                              onClick={() => {
                                setPrepared(null);
                                setFlowError("");
                                requestAnimationFrame(() => ballotFocus.current?.focus({ preventScroll: true }));
                              }}
                            >
                              Discard prepared ballot
                            </ActionButton>
                          </div>
                        </div>
                      </MotionPanel>
                    </div>
                  )}
                </MotionPanel>
                <MotionPanel active={reviewClosing || (!receipt && !prepared)} direction="left">
                  <div className={styles.stack}>
                    <span ref={ballotFocus} tabIndex={-1} className="sr-only" data-wallet-connect-focus="">
                      Ballot settings
                    </span>
                    {variant === "paths" && (
                      <SegmentedControl
                        label="Submission type"
                        value={pathSection}
                        options={[
                          { value: "ballot", label: "Ballot", icon: <ActionIcon name="check" /> },
                          { value: "mask", label: "Mask", icon: <MaskIcon /> },
                        ]}
                        onChange={(next) => {
                          setPathSection(next);
                          if (next === "ballot") {
                            setIncludeVote(true);
                            setIncludeMask(ballotMaskBeforeSwitch.current);
                          } else {
                            ballotMaskBeforeSwitch.current = includeMask;
                            setIncludeVote(false);
                            setIncludeMask(true);
                          }
                        }}
                      />
                    )}
                    {variant === "paths" && <Disclosure open={includeVote}>{power}</Disclosure>}
                    <Disclosure open={includeVote || variant === "compose"}>{presentedVoteChoices}</Disclosure>
                    {variant === "compose" && (
                      <section className={styles.stack} aria-label="Optional mask">
                        <BallotOptionalAction
                          id={`${id}-include-mask`}
                          layout="row"
                          title="Mask"
                          description="Optional · Add cover for voters. No voting power."
                          checked={includeMask}
                          onChange={(checked) => {
                            setIncludeMask(checked);
                            if (!checked) setIncludeVote(true);
                          }}
                        />
                        <Disclosure open={includeMask}>
                          <div className={styles.controlGroup} role="group" aria-label="How to send the mask">
                            <ActionButton
                              size="compact"
                              intent={includeVote ? "confirm" : "open"}
                              aria-pressed={includeVote}
                              onClick={() => selectMaskIntent("with-vote")}
                            >
                              Add mask
                            </ActionButton>
                            <ActionButton
                              size="compact"
                              intent={onlyMask ? "confirm" : "open"}
                              aria-pressed={onlyMask}
                              onClick={() => selectMaskIntent("only")}
                            >
                              Just mask
                            </ActionButton>
                          </div>
                        </Disclosure>
                      </section>
                    )}
                    <Disclosure open={onlyMask} className={variant === "paths" ? styles.pathMaskExplanation : undefined}>
                      {maskExplanation}
                    </Disclosure>
                    {variant === "privacy" ? (
                      <BallotDisclosure title={`Privacy · ${privacySummary}`}>
                        <div className={styles.stack}>
                          <ChoiceMenu<MaskIntent>
                            label="Mask"
                            value={maskIntent}
                            onChange={selectMaskIntent}
                            options={[
                              { value: "none", label: "No mask" },
                              { value: "with-vote", label: "Add to vote" },
                              { value: "only", label: "Mask only" },
                            ]}
                          />
                          <Disclosure open={includeVote}>{randomization}</Disclosure>
                        </div>
                      </BallotDisclosure>
                    ) : variant === "paths" ? null : (
                      <Disclosure open={includeVote}>
                        <BallotDisclosure
                          title={variant === "compose" ? `Voting power · ${share}` : `Privacy · ${share} power`}
                        >
                          <div className={styles.stack}>{randomization}</div>
                        </BallotDisclosure>
                      </Disclosure>
                    )}
                    {variant === "mask-menu" && (
                      <button
                        type="button"
                        className="vp-mask-entry"
                        onClick={(event) => {
                          pickerTrigger.current = event.currentTarget;
                          setPickerOpen(true);
                        }}
                      >
                        <MaskIcon />
                        <span>
                          <strong>{onlyMask ? "Mask only" : includeMask ? "Mask included" : "Mask"}</strong>
                          <span>
                            {includeMask ? "Change how the mask is sent" : "Add to your vote or send on its own"}
                          </span>
                        </span>
                      </button>
                    )}
                    {variant !== "compose" && variant !== "paths" && (
                      <p className="vp-note" aria-live="polite">
                        {sentDescription}
                      </p>
                    )}
                    {variant === "paths" && (
                      <Disclosure open={includeVote} className={styles.privacyToolsDisclosure}>
                        {privacyPresentation === "icons" && <div className={styles.privacyToolsDivider} aria-hidden="true" />}
                        <section
                          ref={privacySectionRef}
                          className={privacyPresentation === "icons" ? styles.privacyToolsLight : styles.privacyTools}
                          data-open={privacyOpen}
                          aria-labelledby={`${id}-privacy-title`}
                        >
                          {privacyPresentation === "icons" && (
                            <svg className={styles.privacyToolsOutline} aria-hidden="true" focusable="false">
                              <rect vectorEffect="non-scaling-stroke" />
                            </svg>
                          )}
                          {privacyPresentation === "icons" ? (
                            <div className={styles.privacyToolsLightHead}>
                              <button
                                type="button"
                                className={styles.privacyToolsLightToggle}
                                aria-label={privacyOpen ? "Hide privacy tools" : "Show privacy tools"}
                                aria-expanded={privacyOpen}
                                aria-controls={`${id}-privacy-options`}
                                onClick={togglePrivacyDetails}
                              >
                                <span className={styles.privacyToolsLightTitle}>
                                  <strong id={`${id}-privacy-title`}>
                                    <CipherTitle tone="light" />
                                  </strong>
                                </span>
                                <span className={styles.privacyToolsExpand} aria-hidden="true">
                                  <BendingChevron open={privacyOpen} width={10} thickness={1.5} />
                                </span>
                              </button>
                              <Tooltip.Provider delayDuration={180}>
                                <div
                                  className={styles.privacyToolsIconGroup}
                                  role="group"
                                  aria-label="Privacy tool selections"
                                >
                                  <PrivacyIconToggle
                                    tool="random"
                                    label="Randomize voting power"
                                    description="Use 99–100% of your snapshot power."
                                    icon={<Percent size={18} weight="regular" aria-hidden="true" />}
                                    checked={randomize}
                                    disabled={privacyOpen}
                                    onToggle={() => changeRandomize(!randomize)}
                                  />
                                  <PrivacyIconToggle
                                    tool="mask"
                                    label="Add a mask"
                                    description="Uses a random eligible voter by default. Open details to change the recipient."
                                    icon={<MaskIcon />}
                                    checked={includeMask}
                                    disabled={privacyOpen}
                                    onToggle={() => setMaskTool(!includeMask)}
                                  />
                                  <PrivacyIconToggle
                                    tool="wallet"
                                    label="Send from another wallet"
                                    description="Prepare with your voting wallet, then switch wallets to send."
                                    icon={<ActionIcon name="send" />}
                                    checked={sendWithAnotherWallet}
                                    disabled={privacyOpen}
                                    onToggle={() => setSendWithAnotherWallet(!sendWithAnotherWallet)}
                                  />
                                </div>
                              </Tooltip.Provider>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={styles.privacyToolsHead}
                              aria-labelledby={`${id}-privacy-title`}
                              aria-expanded={privacyOpen}
                              aria-controls={`${id}-privacy-options`}
                              onClick={() => setPrivacyOpen((open) => !open)}
                            >
                              <span className={styles.privacyToolsPill}>
                                <LockSimple size={18} weight="regular" aria-hidden="true" />
                                <strong id={`${id}-privacy-title`}>
                                  <CipherTitle />
                                </strong>
                              </span>
                              {!privacyOpen && (randomize || includeMask || sendWithAnotherWallet) && (
                                <span className={styles.privacyToolsSummary} aria-label="Active privacy tools">
                                  {randomize && (
                                    <span title="Randomized power">
                                      <Percent size={14} aria-hidden="true" />
                                      <span className="sr-only">Randomized power</span>
                                    </span>
                                  )}
                                  {includeMask && (
                                    <span title="Mask added">
                                      <MaskIcon />
                                      <span className="sr-only">Mask added</span>
                                    </span>
                                  )}
                                  {sendWithAnotherWallet && (
                                    <span title="Another wallet">
                                      <ActionIcon name="send" />
                                      <span className="sr-only">Another wallet</span>
                                    </span>
                                  )}
                                </span>
                              )}
                              <CaretDown className={styles.privacyToolsChevron} size={18} aria-hidden="true" />
                            </button>
                          )}
                          <Disclosure id={`${id}-privacy-options`} open={privacyOpen}>
                            <div className={styles.privacyToolsGrid}>
                              <BallotOptionalAction
                                id={`${id}-review-random`}
                                layout={privacyPresentation === "icons" ? "compact" : "row"}
                                title="Randomize voting power"
                                description="Use 99–100%"
                                icon={
                                  <span data-privacy-detail-icon="random">
                                    <Percent size={22} weight="regular" aria-hidden="true" />
                                  </span>
                                }
                                info={
                                  <p>
                                    Use a random 99–100% of your snapshot voting power. Slightly reducing the weight
                                    makes it harder to link a ballot to your wallet balance. The amount used is shown
                                    above before you confirm.
                                  </p>
                                }
                                checked={randomize}
                                onChange={changeRandomize}
                              >
                                {privacyPresentation === "icons" && (
                                  <p className="ballot-optional-note">
                                    The amount above uses a random 99–100% of your snapshot voting power.
                                  </p>
                                )}
                              </BallotOptionalAction>
                              <BallotOptionalAction
                                id={`${id}-review-mask`}
                                layout={privacyPresentation === "icons" ? "compact" : "row"}
                                title="Add a mask"
                                description="Adds cover"
                                info={
                                  <p>
                                    A mask adds cover without voting power. It is sent separately from your vote and
                                    does not change the option you chose. Choose who receives the cover below.
                                  </p>
                                }
                                icon={
                                  <span data-privacy-detail-icon="mask">
                                    <MaskIcon />
                                  </span>
                                }
                                checked={includeMask}
                                onChange={setMaskTool}
                              >
                                {privacyPresentation === "icons" && (
                                  <p className="ballot-optional-note">
                                    Adds cover without voting power. The mask is sent separately from your vote.
                                  </p>
                                )}
                                {maskRecipient}
                              </BallotOptionalAction>
                              <BallotOptionalAction
                                id={`${id}-sending-wallet`}
                                layout={privacyPresentation === "icons" ? "compact" : "row"}
                                title="Send from another wallet"
                                description="Use another sender"
                                info={
                                  <p>
                                    Prepare the encrypted vote with your voting wallet, then switch wallets to send it.
                                    Your voting power still comes from the original wallet. If you add a mask, it is
                                    sent in a separate step.
                                  </p>
                                }
                                icon={
                                  <span data-privacy-detail-icon="wallet">
                                    <ActionIcon name="send" />
                                  </span>
                                }
                                checked={sendWithAnotherWallet}
                                onChange={setSendWithAnotherWallet}
                              >
                                {privacyPresentation === "icons" && (
                                  <p className="ballot-optional-note">
                                    Prepare the vote here, then switch wallets to send it. Your voting power stays with
                                    the original wallet.{includeMask ? " The mask is sent in a separate step." : ""}
                                  </p>
                                )}
                              </BallotOptionalAction>
                            </div>
                            {privacyPresentation === "classic" && includeMask && sendWithAnotherWallet && (
                              <p className={styles.privacyToolsNote}>
                                Prepare the vote here, switch wallets to send it, then send the mask separately.
                              </p>
                            )}
                          </Disclosure>
                        </section>
                      </Disclosure>
                    )}

                    {!votingWalletConnected && includeVote && (
                      <PowerWarning
                        title="Connect your voting wallet"
                        action={
                          <ActionButton size="compact" affordance="wallet" onClick={openDemoWalletPanel}>
                            {walletAvailable ? "Change wallet" : "Connect wallet"}
                          </ActionButton>
                        }
                      >
                        {walletAvailable
                          ? "The sending wallet has no voting power. Switch to your voting wallet to cast or change a vote."
                          : "Connect your voting wallet to cast or change a vote."}
                      </PowerWarning>
                    )}
                    <ActionButton
                      intent={onlyMask ? "confirm" : "vote"}
                      disabled={!valid || pending || !walletAvailable || (includeVote && !votingWalletConnected)}
                      onClick={(event) => {
                        reviewTrigger.current = event.currentTarget;
                        reviewOriginLabel.current = event.currentTarget.textContent ?? "Review vote";
                        reviewOriginTitle.current = onlyMask
                          ? "Send a mask"
                          : currentVote !== null
                            ? "Change your vote"
                            : "Cast ballot";
                        setFlowError("");
                        setReviewOpen(true);
                      }}
                    >
                      {reviewClosing
                        ? reviewOriginLabel.current
                        : onlyMask
                          ? "Review mask"
                          : !includeVote
                            ? "Choose what to send"
                            : choice === null
                              ? "Choose your vote"
                              : currentVote !== null
                                ? includeMask
                                  ? "Review vote change + mask"
                                  : "Review vote change"
                                : includeMask
                                  ? "Review vote + mask"
                                  : "Review vote"}
                    </ActionButton>
                  </div>
                </MotionPanel>
              </div>
            </FluidHeight>
          </div>
        </BallotPanel>
      </div>

      <ActionTray
        open={pickerOpen}
        pending={pending}
        title="How would you like to send a mask?"
        triggerRef={pickerTrigger}
        onClose={() => setPickerOpen(false)}
      >
        <div className={styles.stack}>
          <p className="vp-note">A mask adds cover without changing anyone’s vote.</p>
          <ActionButton
            onClick={() => {
              selectMaskIntent("with-vote");
              setPickerOpen(false);
            }}
          >
            Add to my vote
          </ActionButton>
          <ActionButton
            onClick={() => {
              selectMaskIntent("only");
              setPickerOpen(false);
            }}
          >
            Mask only
          </ActionButton>
          {includeMask && (
            <ActionButton
              onClick={() => {
                selectMaskIntent("none");
                setPickerOpen(false);
              }}
            >
              Continue without a mask
            </ActionButton>
          )}
        </div>
      </ActionTray>

      <BallotReview
        open={reviewOpen && walletAvailable}
        signatureExpanded={signatureExpanded}
        detailView={
          variant === "paths" && includeVote
            ? {
                open: signatureExpanded,
                title: "Signature data",
                content: <SignatureData full={true} />,
                onBack: () => setSignatureExpanded(false),
                triggerRef: signatureTrigger,
              }
            : undefined
        }
        pending={pending}
        triggerRef={reviewTrigger}
        returnFocusRef={receipt ? resultAction : prepared ? (maskStep ? maskFocus : preparedFocus) : undefined}
        onClose={() => setReviewOpen(false)}
        onCloseComplete={() => setReviewClosing(false)}
        choice={onlyMask ? "Mask" : voteOptions[choice ?? 0]}
        optionIndex={choice ?? 0}
        isMask={onlyMask}
        emphasis={variant === "paths" && includeVote ? "choice" : "standard"}
        votingPower={
          includeVote &&
          variant !== "paths" && (
            <div className="ballot-review-row">
              <span>Your voting power</span>
              <strong>
                <span className={styles.reviewPowerValues}>
                  <span className={styles.reviewPowerPercent} data-active={randomize}>
                    <AnimatedAmount plain={true} value={appliedPercent} />
                  </span>
                  <AnimatedAmount highlighted={randomize} plain={!randomize} value={countedPower} />
                </span>
              </strong>
            </div>
          )
        }
        footer={
          <ActionButton
            ref={reviewAction}
            intent={onlyMask ? "confirm" : "vote"}
            disabled={pending || !walletAvailable || (includeVote && !votingWalletConnected)}
            isLoading={pending}
            onClick={preview}
          >
            {pending
              ? pendingStep === "prepare"
                ? "Confirm signature in wallet"
                : pendingStep === "mask"
                  ? "Sending mask"
                  : "Confirm ballot in wallet"
              : variant === "paths" && includeVote && sendWithAnotherWallet
                ? "Prepare vote"
                : variant === "paths"
                  ? onlyMask
                    ? "Send mask"
                    : "Send vote"
                  : "Confirm"}
          </ActionButton>
        }
      >
        <div className={styles.stack}>
          {flowError && (
            <p className="power-field-error" role="alert">
              {flowError}
            </p>
          )}
          {variant === "paths" && includeVote && (
            <div className={styles.reviewDetails}>
              <div className={styles.reviewDetailRow}>
                <span className={styles.reviewPrivacyInfo}>
                  <PowerInfo
                    label={randomize ? "Randomize voting power" : "Randomization off · Full voting power"}
                    compact={true}
                    contentClassName={styles.reviewPrivacyTooltip}
                    trigger={
                      <span className={styles.reviewPrivacyBubble} data-active={randomize}>
                        <Percent size={18} weight="regular" aria-hidden="true" />
                      </span>
                    }
                  >
                    {randomize ? "Randomize voting power" : "Randomization off · Full voting power"}
                  </PowerInfo>
                </span>
                <div className={styles.reviewDetailContent}>
                  <span className={styles.powerInfoTrigger}>
                    <PowerInfo contentClassName={styles.powerCalculationPopover} label="How your voting power is calculated" compact={true} trigger="Your voting power">
                      {powerCalculation}
                    </PowerInfo>
                  </span>
                  <strong className={styles.powerInfoTrigger}>
                    <PowerInfo contentClassName={styles.powerCalculationPopover}
                      label={`How ${countedPower} is calculated`}
                      compact={true}
                      trigger={
                        <span className={styles.reviewPowerValues}>
                          <span className={styles.reviewPowerPercent} data-active={randomize}>
                            <AnimatedAmount plain={true} value={appliedPercent} />
                          </span>
                          <AnimatedAmount highlighted={randomize} plain={!randomize} value={countedPower} />
                        </span>
                      }
                    >
                      {powerCalculation}
                    </PowerInfo>
                  </strong>
                </div>
              </div>
              {includeMask && (
                <div className={styles.reviewDetailRow}>
                  <span className={styles.reviewPrivacyInfo}>
                    <PowerInfo
                      label="Add a mask"
                      compact={true}
                      contentClassName={styles.reviewPrivacyTooltip}
                      trigger={<span className={styles.reviewPrivacyBubble} data-active={true}><MaskIcon /></span>}
                    >
                      Add a mask
                    </PowerInfo>
                  </span>
                  <div className={styles.reviewDetailContent}>
                    <span>Mask recipient</span>
                    <strong>
                      {recipientMode === "random"
                        ? "Random eligible voter"
                        : recipientMode === "self"
                          ? "Your wallet"
                          : `${recipientAddress.slice(0, 8)}…${recipientAddress.slice(-4)}`}
                    </strong>
                  </div>
                </div>
              )}
              {sendWithAnotherWallet && (
                <div className={styles.reviewDetailRow}>
                  <span className={styles.reviewPrivacyInfo}>
                    <PowerInfo
                      label="Send from another wallet"
                      compact={true}
                      contentClassName={styles.reviewPrivacyTooltip}
                      trigger={<span className={styles.reviewPrivacyBubble} data-active={true}><ActionIcon name="send" /></span>}
                    >
                      Send from another wallet
                    </PowerInfo>
                  </span>
                  <div className={styles.reviewDetailContent}>
                    <span>Sending wallet</span>
                    <strong>Another wallet</strong>
                  </div>
                </div>
              )}
            </div>
          )}
          {includeMask && variant !== "paths" && (
            <div className="ballot-review-row">
              <span>Mask recipient</span>
              <strong>Random eligible voter</strong>
            </div>
          )}
          {variant === "paths" && onlyMask && maskRecipient}

          {variant !== "paths" && includeVote && includeMask && (
            <div className={styles.submissionSummary}>
              <span>2 submissions</span>
              <span
                className={styles.submissionSequence}
                title={sendWithAnotherWallet ? "Vote from another wallet, then mask" : "Vote, then mask"}
              >
                <span className="sr-only">
                  {sendWithAnotherWallet ? "Vote from another wallet, then mask" : "Vote, then mask"}
                </span>
                <ActionIcon name="check" />
                <ActionIcon name="next" />
                <MaskIcon />
              </span>
            </div>
          )}
          {variant === "paths" && includeVote && (
            <>
              {(sendWithAnotherWallet || includeMask) && (
                <SigningSteps
                  numberStyle="inline-small"
                  switchWallet={sendWithAnotherWallet}
                  includeMask={includeMask}
                  explanationStyle="inline"
                />
              )}
              <button
                ref={signatureTrigger}
                className={signatureStyles.entry}
                data-presentation="closed-dash"
                type="button"
                onClick={() => setSignatureExpanded(true)}
              >
                <SignatureReviewEntryContent />
              </button>
            </>
          )}
          {variant === "paths" && onlyMask && (
            <div className="ui-info-note" role="note">
              <Info size={18} weight="regular" aria-hidden="true" />
              <p>
                <strong>About this mask</strong>
                <br />
                {reviewExplanation}
              </p>
            </div>
          )}
          {variant === "paths" && onlyMask && currentVote !== null && <p className="vp-note">{unchangedVote}</p>}
          {variant !== "paths" && (
            <>
              <p className="vp-note">
                {onlyMask
                  ? unchangedVote
                  : includeMask
                    ? "The mask has no voting power and does not replace your vote."
                    : "Your encrypted vote will use the amount shown above."}
              </p>
            </>
          )}
        </div>
      </BallotReview>
    </>
  );
}
