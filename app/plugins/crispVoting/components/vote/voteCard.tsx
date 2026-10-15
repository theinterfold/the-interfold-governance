import { ballotWeightPercentage, type BallotWeight } from "../../utils/ballotWeight";
import { ballotSignatureRequest } from "../../utils/ballotDigest";
import { useCrispProgram } from "../../hooks/useCrispProgram";
import { exactNumber } from "@/utils/numbers";
import { BallotSuccess } from "@/components/proposalVoting/ballotSuccess";
import { PUB_CHAIN, PUB_TOKEN_SYMBOL } from "@/constants";
import { ActionIcon } from "@/components/input/actionIcon";
import { MaskRecipientField, type MaskTargetMode } from "./maskRecipientField";
import { MaskQueue, type MaskEntry } from "./maskQueue";
import { ChoiceMenu } from "@/components/input/choiceMenu";
import { AddressText } from "@/components/text/address";
import { unixTimestampToDate } from "../../utils/formatProposalDate";
import type { CreditsMode, EligibleVoter, VotingStep } from "../../utils/types";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, getAddress, isAddress, type Address } from "viem";
import { Percent } from "@phosphor-icons/react";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { useInert } from "@/components/motion/useInert";
import { BallotDisclosure } from "@/components/proposalVoting/ballotDisclosure";
import VotingStepIndicator from "./voteProgress";
import {
  BallotPanel,
  BallotSubmissionInfo,
  BallotChoices,
  BallotReview,
  MaskIcon,
  ballotOptionColor as getColor,
} from "@/components/proposalVoting/ballot";
import {
  PowerCalculation,
  PowerShare,
  PrivacyReview,
  PrivacyReviewRow,
  PrivacyTools,
  SubmissionSteps,
  type PrivacyTool,
} from "@/components/proposalVoting/privacyTools";
import { SignatureData, SignatureDataEntry } from "@/components/proposalVoting/signatureData";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { equalAddresses } from "@/utils/evm";
import { crispSdk } from "../../utils/crispSdk";
import { getRandomVoterToMask, pickMaskRecipients } from "../../utils/voters";
import {
  randomFirstBallot,
  submitBallotSequence,
  submitMaskSequence,
  type BallotKind,
  type BallotSubmissionResult,
} from "../../utils/ballotSubmission";

/** What each signed field of a ballot means, beside the request in the review. */
const SIGNATURE_NOTES = [
  { field: "verifyingContract", note: "The CRISP program named as the signature verifier." },
  { field: "e3Id", note: "The encrypted voting round." },
  { field: "slot", note: "The ballot slot this vote is bound to." },
  { field: "ciphertextCommitment", note: "Binds the encrypted ballot. The hash does not reveal the choice or amount." },
];

/** A ballot is encrypted only after its review, so the review cannot show the commitment yet. */
const COMMITMENT_PENDING = "Computed when your ballot is encrypted, just before your wallet asks you to sign";

const randomizeIcon = <Percent size={18} weight="regular" aria-hidden="true" />;

const tokenAmount = (raw: bigint, decimals: number) =>
  `${exactNumber(formatUnits(raw, decimals), 2)} ${PUB_TOKEN_SYMBOL}`;

export interface VoteCardProps {
  creditMode?: CreditsMode;
  votingPower?: ReactNode;
  /** Why this wallet cannot vote (`BallotEligibilityNotice`). Shown in place of the vote choices. */
  eligibilityNotice?: ReactNode;
  /** A timing-only explanation (not open yet, already closed). Replaces the eligibility notice. */
  notice?: string;
  /** Masking writes someone else's slot, so the wallet's own voting power does not gate it. */
  canMask?: boolean;
  proposalTitle?: string;
  /** The round whose eligible voters a mask can target. */
  e3Id?: bigint;
  /** Draws the weight that the ballot counts and returns it for the voter to review. */
  getVoteWeight: (randomize: boolean) => Promise<BallotWeight>;
  options: string[];
  voteStartDate: number;
  voteEndDate: number;
  disabled: boolean;
  isLoading: boolean;
  proposalId: bigint;
  votingStep: VotingStep;
  lastActiveStep: VotingStep | null;
  stepMessage: string;
  isCommitteeReady: boolean;
  txHash: string | null;
  /** The connected wallet cannot cast a vote on this proposal (or eligibility is still loading). */
  voteDisabled?: boolean;
  onClickVote: (voteOption: number, weight: BallotWeight) => Promise<BallotSubmissionResult>;
  /** The round accepts a direct on-chain vote right now. */
  canPublishOnChain?: boolean;
  /** Why the on-chain route is unavailable, when it is. */
  onChainBlockedReason?: string;
  /** Send the ballot from the voter's wallet rather than via the CRISP server. */
  submitOnChain?: boolean;
  onChangeSubmitOnChain: (value: boolean) => void;
  /** Write a mask to this slot, or to a random eligible voter's when `undefined`. */
  onClickMask: (target?: Address) => Promise<BallotSubmissionResult>;
  /**
   * Sign and stage the vote, then keep it for another wallet to send. Left out, the review offers
   * no such action.
   */
  onPrepareVote?: (voteOption: number, weight: BallotWeight) => Promise<BallotSubmissionResult>;
}

export const VoteCard = ({
  creditMode,
  votingPower,
  eligibilityNotice,
  notice,
  canMask = true,
  proposalTitle,
  e3Id,
  getVoteWeight,
  options,
  voteStartDate,
  voteEndDate,
  disabled,
  isLoading,
  onClickVote,
  canPublishOnChain,
  onChainBlockedReason,
  submitOnChain = false,
  onChangeSubmitOnChain,
  onClickMask,
  onPrepareVote,
  votingStep,
  lastActiveStep,
  stepMessage,
  isCommitteeReady,
  txHash,
  voteDisabled = false,
}: VoteCardProps) => {
  // A mask adds cover independently of the selected voting option.
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submittedMode, setSubmittedMode] = useState<BallotKind | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  // Immediate feedback only: no vote choices, mask counters or history are persisted.
  const [voteReceipt, setVoteReceipt] = useState<{ txHash: string | null; option: number | null }>();
  const [maskReceipts, setMaskReceipts] = useState<(string | null)[]>([]);
  const [editingVote, setEditingVote] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [randomizeWeight, setRandomizeWeight] = useState(true);
  const [reviewWeight, setReviewWeight] = useState<BallotWeight>();
  const [weightError, setWeightError] = useState<string>();
  const [weightAttempt, setWeightAttempt] = useState(0);
  const [reviewMode, setReviewMode] = useState<BallotKind>("vote");
  // The masks a mask review sends: the "Add a mask" tool's one mask, or the mask list.
  const [reviewSource, setReviewSource] = useState<"tool" | "queue">("queue");
  const [includeMask, setIncludeMask] = useState(false);
  const [sendFirst, setSendFirst] = useState<BallotKind>("vote");
  const [sendWithAnotherWallet, setSendWithAnotherWallet] = useState(false);
  const [targetMode, setTargetMode] = useState<MaskTargetMode>("random");
  const [targetInput, setTargetInput] = useState("");
  const nextMaskId = useRef(1);
  const [maskQueue, setMaskQueue] = useState<MaskEntry[]>([{ id: 0, mode: "random", target: "" }]);
  // A wallet that cannot vote comes here to mask, so the mask section starts open for it.
  const [masksOpen, setMasksOpen] = useState(voteDisabled);
  const [submitting, setSubmitting] = useState(false);
  const [attemptError, setAttemptError] = useState<string>();
  // The first submission of a vote + mask attempt. Null when the attempt sends one ballot.
  const [combinedFirst, setCombinedFirst] = useState<BallotKind | null>(null);
  // Progress of masks sent on their own. Null for an attempt that sends the vote.
  const [maskRun, setMaskRun] = useState<{ total: number; current: number; sent: number } | null>(null);
  const [signatureExpanded, setSignatureExpanded] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const signatureTrigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const submittingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => setMasksOpen(voteDisabled), [voteDisabled]);
  const submissionKind: BallotKind = selectedOption === null && includeMask ? "mask" : "vote";
  const isSubmitted = !!voteReceipt && !editingVote;
  const isChangingVote = !!voteReceipt && !isSubmitted;
  const busy = submitting || isLoading;
  const sendingMasks = submitting && maskRun !== null;
  const feedbackVisible = showFeedback && (busy || !!attemptError);
  const feedbackRef = useInert(!feedbackVisible);
  const isReviewMasking = reviewMode === "mask";
  const crispProgram = useCrispProgram(e3Id);

  // The CRISP server's census is what the random pick draws from, and the chain still has the last
  // word: `handleMask` re-reads an ONCHAIN round's weight from the program before proving.
  const {
    data: census,
    error: recipientError,
    refetch: reloadRecipients,
  } = useQuery({
    queryKey: ["crisp-mask-candidates", e3Id?.toString()],
    queryFn: () => crispSdk.getEligibleAddresses(e3Id!),
    enabled: e3Id !== undefined && (includeMask || masksOpen || (reviewOpen && isReviewMasking)),
  });
  // The connected wallet stays in the list, so a voter can also mask their own slot.
  const recipients = useMemo<EligibleVoter[] | undefined>(
    () => census?.map((voter) => ({ address: voter.address, balance: BigInt(voter.balance) })),
    [census]
  );
  const recipientInvalid = (mode: MaskTargetMode, target: string) =>
    mode === "random"
      ? !recipients?.length
      : !isAddress(target.trim()) || !recipients?.some((voter) => equalAddresses(voter.address, target.trim()));
  const toolTargetInvalid = includeMask && recipientInvalid(targetMode, targetInput);
  const reviewMasks: MaskEntry[] =
    reviewSource === "tool" ? [{ id: -1, mode: targetMode, target: targetInput }] : maskQueue;
  const reviewMasksInvalid = reviewMasks.some((entry) => recipientInvalid(entry.mode, entry.target));

  useEffect(() => {
    if (!reviewOpen || isReviewMasking) return;
    let cancelled = false;
    setReviewWeight(undefined);
    setWeightError(undefined);
    void getVoteWeight(randomizeWeight).then(
      (weight) => {
        if (!cancelled) setReviewWeight(weight);
      },
      (error: unknown) => {
        if (!cancelled) setWeightError(error instanceof Error ? error.message : "Could not load your voting power.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [reviewOpen, isReviewMasking, randomizeWeight, getVoteWeight, weightAttempt]);

  const openReview = (trigger: HTMLElement, kind: BallotKind, source: "tool" | "queue" = "tool") => {
    triggerRef.current = trigger;
    setReviewMode(kind);
    setReviewSource(source);
    setReviewWeight(undefined);
    setWeightError(undefined);
    setSignatureExpanded(false);
    setSendFirst(randomFirstBallot());
    setReviewOpen(true);
  };

  const startAttempt = () => {
    submittingRef.current = true;
    setSubmitting(true);
    setReviewOpen(false);
    setAttemptError(undefined);
    setShowFeedback(true);
  };

  const confirmVote = async () => {
    if (submittingRef.current || isDisabled || voteDisabled || selectedOption === null || !reviewWeight) return;
    if (toolTargetInvalid) return;
    // The recipient is fixed before anything is sent, so a vote and its mask never disagree on it.
    const target = !includeMask
      ? undefined
      : targetMode === "address"
        ? getAddress(targetInput.trim())
        : getAddress(getRandomVoterToMask(recipients!).address);
    startAttempt();
    setEditingVote(true);
    setMaskRun(null);
    setCombinedFirst(includeMask ? sendFirst : null);
    const option = selectedOption;
    try {
      // Prepare only: the vote is signed and saved here, and another wallet sends it. The page then
      // swaps this card for the prepared ballot, so there is no receipt to record.
      if (sendWithAnotherWallet && onPrepareVote) {
        setSubmittedMode("vote");
        const result = await onPrepareVote(option, reviewWeight);
        if (mounted.current && !result.success) setAttemptError(result.error);
        return;
      }
      await submitBallotSequence({
        vote: () => onClickVote(option, reviewWeight),
        mask: includeMask ? () => onClickMask(target) : undefined,
        first: sendFirst,
        isCurrent: () => mounted.current,
        onStart: setSubmittedMode,
        onResult: (kind, result) => {
          if (!result.success) {
            setAttemptError(result.error);
            return;
          }
          if (kind === "mask") {
            setMaskReceipts((previous) => [...previous, result.txHash]);
            setIncludeMask(false);
            return;
          }
          // A mask sent before the vote does not end the edit of that vote.
          setVoteReceipt({ txHash: result.txHash, option });
          setEditingVote(false);
        },
      });
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  const confirmMasks = async () => {
    if (submittingRef.current || isDisabled || !canMask || reviewMasksInvalid || !recipients) return;
    const entries = reviewMasks;
    const source = reviewSource;
    // Every recipient is fixed before the first mask is sent, and random ones avoid each other.
    const targets = pickMaskRecipients(
      entries.map((entry) => (entry.mode === "address" ? entry.target.trim() : undefined)),
      recipients
    ).map((address) => getAddress(address));
    startAttempt();
    setCombinedFirst(null);
    setSubmittedMode("mask");
    setMaskRun({ total: entries.length, current: 0, sent: 0 });
    try {
      await submitMaskSequence({
        masks: targets.map((target) => () => onClickMask(target)),
        isCurrent: () => mounted.current,
        onStart: (index) => setMaskRun((run) => run && { ...run, current: index }),
        onResult: (index, result) => {
          if (!result.success) {
            setAttemptError(result.error);
            return;
          }
          setMaskRun((run) => run && { ...run, sent: run.sent + 1 });
          setMaskReceipts((previous) => [...previous, result.txHash]);
          if (source === "tool") {
            setIncludeMask(false);
            return;
          }
          // A sent mask leaves the list, so a failure leaves exactly the masks still to send.
          setMaskQueue((queue) => {
            const rest = queue.filter((entry) => entry.id !== entries[index].id);
            return rest.length ? rest : [{ id: nextMaskId.current++, mode: "random", target: "" }];
          });
        },
      });
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  const addMask = () => setMaskQueue((queue) => [...queue, { id: nextMaskId.current++, mode: "random", target: "" }]);

  const editSubmission = () => {
    setEditingVote(true);
    setSelectedOption(voteReceipt?.option ?? null);
    setIncludeMask(false);
    setShowFeedback(false);
  };

  const votingClosed = voteEndDate <= Math.round(Date.now() / 1000);
  const isDisabled = disabled || busy || votingClosed;
  const notStarted = voteStartDate > Math.round(Date.now() / 1000);
  const started = voteStartDate < Math.round(Date.now() / 1000);

  const setMaskTool = (checked: boolean) => {
    // The bar can turn the mask on without its details, so it starts with the random recipient.
    if (checked) setTargetMode("random");
    setIncludeMask(checked);
  };

  const setOtherWallet = (checked: boolean) => {
    setSendWithAnotherWallet(checked);
    // Another wallet sends only the signed vote. A mask is sent separately.
    if (checked) setIncludeMask(false);
  };

  // The "Add a mask" tool's recipient, also shown in a vote review whose recipient cannot be masked.
  const maskRecipient = (
    <MaskRecipientField
      mode={targetMode}
      onModeChange={setTargetMode}
      target={targetInput}
      onTargetChange={setTargetInput}
      recipients={recipients}
      recipientError={!!recipientError}
      onRetry={() => void reloadRecipients()}
      pending={busy}
      creditMode={creditMode}
      e3Id={e3Id}
    >
      <p>Adds cover for voters without changing any votes.</p>
    </MaskRecipientField>
  );

  const privacyTools: PrivacyTool[] = [
    {
      id: "randomize",
      title: "Randomize voting power",
      description: "Use 99–100%",
      hint: "Use 99–100% of your snapshot power.",
      icon: randomizeIcon,
      checked: randomizeWeight,
      info: (
        <p>
          Use a random 99–100% of your snapshot voting power. Slightly reducing the weight makes it harder to link a
          ballot to your wallet balance. The review shows the amount used before you confirm.
        </p>
      ),
      details: (
        <p className="ballot-optional-note">
          Your ballot counts a random 99–100% of your snapshot voting power. The review shows the exact amount.
        </p>
      ),
      onChange: setRandomizeWeight,
    },
    ...(canMask
      ? [
          {
            id: "mask",
            title: "Add a mask",
            description: "Adds cover",
            hint: "Uses a random eligible voter by default. Open details to change the recipient.",
            icon: <MaskIcon />,
            checked: includeMask,
            unavailable: sendWithAnotherWallet
              ? "You cannot add a mask when another wallet sends your vote. Send the mask separately."
              : undefined,
            info: (
              <p>
                A mask adds cover without voting power. It is sent separately from your vote and does not change the
                option you chose. Choose who receives the cover below.
              </p>
            ),
            details: maskRecipient,
            onChange: setMaskTool,
          },
        ]
      : []),
    ...(onPrepareVote
      ? [
          {
            id: "wallet",
            title: "Send from another wallet",
            description: "Use another sender",
            hint: "Prepare with your voting wallet, then switch wallets to send.",
            icon: <ActionIcon name="send" />,
            checked: sendWithAnotherWallet,
            // A tool that is on stays available, so that it can be turned off.
            unavailable:
              sendWithAnotherWallet || canPublishOnChain
                ? undefined
                : (onChainBlockedReason ?? "Checking whether this round accepts wallet-sent votes…"),
            info: (
              <p>
                Prepare the encrypted vote with your voting wallet, then switch to a wallet with{" "}
                {PUB_CHAIN.nativeCurrency.symbol} to send it. Your voting power still comes from the original wallet.
              </p>
            ),
            details: (
              <p className="ballot-optional-note">
                Prepare the vote here, then switch wallets to send it. The signed ballot stays in this browser until you
                send or discard it. A mask cannot be sent in the same step.
              </p>
            ),
            onChange: setOtherWallet,
          },
        ]
      : []),
  ];

  const power = reviewWeight && {
    share: ballotWeightPercentage(reviewWeight),
    counted: tokenAmount(reviewWeight.counted * reviewWeight.unit, reviewWeight.decimals),
    snapshot: tokenAmount(reviewWeight.power, reviewWeight.decimals),
    randomized: reviewWeight.randomize,
    // Rules of the round that make the counted amount differ from the share the voter chose.
    notes: [
      reviewWeight.randomize && reviewWeight.counted === reviewWeight.available
        ? "Your voting power is too small to reduce by less than 1% at this round’s precision. This ballot uses all of your available voting power."
        : undefined,
      reviewWeight.power > reviewWeight.available * reviewWeight.unit
        ? `This round counts voting power in whole units of ${tokenAmount(reviewWeight.unit, reviewWeight.decimals)}. Voting power below one unit does not count.`
        : undefined,
    ].filter((note) => note !== undefined),
  };

  const voteStep = {
    title: "Sign your encrypted vote",
    text: sendWithAnotherWallet ? "Prepare the ballot." : "Sign and submit the ballot.",
  };
  const maskStep = { title: "Send the mask", text: "Add cover in a separate submission." };
  const submissionSteps = sendWithAnotherWallet
    ? [
        voteStep,
        { title: "Switch wallet", text: "Choose the wallet that pays gas." },
        { title: "Send your vote", text: "Submit the signed ballot." },
      ]
    : includeMask
      ? sendFirst === "mask"
        ? [maskStep, voteStep]
        : [voteStep, maskStep]
      : [voteStep];

  // What the wallet will be asked to sign, except the commitment that encryption makes after the review.
  const signatureRequest =
    !isReviewMasking && crispProgram && e3Id !== undefined && reviewWeight
      ? ballotSignatureRequest({
          chainId: PUB_CHAIN.id,
          crispProgram,
          e3Id,
          slot: getAddress(reviewWeight.voter),
          ciphertextCommitment: undefined,
        })
      : undefined;

  const maskCount = reviewMasks.length;
  const queueCount = maskQueue.length;

  return (
    <BallotPanel
      title={isSubmitted || voteDisabled ? "Voting" : isChangingVote ? "Change your vote" : "Cast ballot"}
      submitted={isSubmitted}
      info={(canMask || !voteDisabled) && <BallotSubmissionInfo submitOnChain={submitOnChain} />}
    >
      <div className="vp-body">
        {/* `notice` already states the start time when voting has not opened, so repeating it
            produced two copies of the same sentence. */}
        {notStarted && !notice && (
          <p className="vp-foot-note" style={{ textAlign: "left" }}>
            The vote will start on {unixTimestampToDate(voteStartDate)}
          </p>
        )}

        {started && !isCommitteeReady && (
          <div
            className="border px-4 py-3"
            style={{ borderColor: "var(--rule)", background: "var(--surface-selected)" }}
          >
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              The ciphernode committee is being formed. Voting will be available once the committee is ready.
            </p>
          </div>
        )}

        {/* Voting and masking are separate sections: a mask is an action of its own, not a step of the vote. */}
        <BallotDisclosure className="vp-section" title="Your vote" defaultOpen={true}>
          <div className="vp-section-body">
            {isSubmitted && voteReceipt && (
              <BallotSuccess txHash={voteReceipt.txHash}>
                Your encrypted vote has been submitted. You can change it before voting closes.
              </BallotSuccess>
            )}
            {(!voteDisabled || isSubmitted) && votingPower}
            {voteDisabled &&
              !isSubmitted &&
              (notice ? (
                <p className="vp-foot-note" style={{ textAlign: "left" }}>
                  {notice}
                </p>
              ) : (
                eligibilityNotice
              ))}
            {!voteDisabled && !isSubmitted && !voteReceipt && (
              <p className="vp-note">
                Choose an option, and select it again to clear it. Your vote stays private, and you can change it before
                voting closes.
              </p>
            )}
            {isSubmitted ? (
              <div className="vp-confirmed-choice">
                <span
                  className="swatch"
                  style={{ background: getColor(voteReceipt?.option ?? 0) }}
                  aria-hidden="true"
                />
                <strong>{options[voteReceipt?.option ?? 0]}</strong>
              </div>
            ) : !voteDisabled ? (
              <BallotChoices
                options={options}
                value={selectedOption}
                currentVote={voteReceipt?.option}
                onChange={(choice) => {
                  if (typeof choice === "number") setSelectedOption(choice);
                }}
                onClear={() => setSelectedOption(null)}
                disabled={isDisabled}
                voteDisabled={voteDisabled}
              />
            ) : null}
            {!isSubmitted && !voteDisabled && <PrivacyTools tools={privacyTools} disabled={isDisabled} />}

            {!voteDisabled && (
              <div className="vp-cta">
                {isSubmitted ? (
                  <PowerAction className="vp-edit-submission" disabled={isDisabled} onClick={editSubmission}>
                    {votingClosed ? "Voting closed" : "Change vote"}
                  </PowerAction>
                ) : (
                  <PowerAction
                    className="w-full"
                    intent={submissionKind === "vote" ? "vote" : "confirm"}
                    disabled={isDisabled || (submissionKind === "vote" && selectedOption === null)}
                    onClick={(event: MouseEvent<HTMLButtonElement>) => openReview(event.currentTarget, submissionKind)}
                  >
                    <span
                      className="vp-label-change"
                      key={busy && !sendingMasks ? "loading" : `${submissionKind}-${selectedOption}`}
                    >
                      {busy && !sendingMasks ? (
                        <PleaseWaitSpinner
                          fullMessage={submittedMode === "mask" ? "Preparing mask…" : "Encrypting ballot…"}
                        />
                      ) : submissionKind === "mask" ? (
                        "Submit mask ballot"
                      ) : selectedOption !== null ? (
                        `${includeMask ? (voteReceipt ? "Review updated vote + mask" : "Review vote + mask") : voteReceipt ? "Update vote" : "Submit encrypted ballot"} · ${options[selectedOption]}`
                      ) : (
                        "Select an option"
                      )}
                    </span>
                  </PowerAction>
                )}

                {/* A mask that is on can also go without the chosen vote, the same as clearing the option. */}
                {!isSubmitted && includeMask && selectedOption !== null && (
                  <PowerAction
                    className="w-full"
                    disabled={isDisabled}
                    onClick={(event: MouseEvent<HTMLButtonElement>) => openReview(event.currentTarget, "mask")}
                  >
                    Send only the mask
                  </PowerAction>
                )}
              </div>
            )}
          </div>
        </BallotDisclosure>

        {canMask && (
          <BallotDisclosure
            // Remounted when eligibility settles, so a wallet that turns out unable to vote finds it open.
            key={String(voteDisabled)}
            className="vp-section"
            title="Submit a mask"
            defaultOpen={voteDisabled}
            onOpenChange={setMasksOpen}
          >
            <div className="vp-section-body">
              <p className="vp-note">
                Add cover for eligible voters with encrypted, zero-weight ballots. A mask adds no voting power and does
                not change any vote. Add as many masks as you like: each one is a separate submission.
              </p>
              <MaskQueue
                entries={maskQueue}
                onChange={setMaskQueue}
                onAdd={addMask}
                recipients={recipients}
                recipientError={!!recipientError}
                onRetry={() => void reloadRecipients()}
                pending={busy}
                creditMode={creditMode}
                e3Id={e3Id}
              />
              <div className="vp-cta">
                <PowerAction
                  className="w-full"
                  intent="confirm"
                  disabled={isDisabled}
                  onClick={(event: MouseEvent<HTMLButtonElement>) => openReview(event.currentTarget, "mask", "queue")}
                >
                  <span className="vp-label-change" key={sendingMasks ? "loading" : `masks-${queueCount}`}>
                    {sendingMasks && maskRun ? (
                      <PleaseWaitSpinner
                        fullMessage={
                          maskRun.total > 1
                            ? `Preparing mask ${maskRun.current + 1} of ${maskRun.total}…`
                            : "Preparing mask…"
                        }
                      />
                    ) : queueCount === 1 ? (
                      "Review mask"
                    ) : (
                      `Review ${queueCount} masks`
                    )}
                  </span>
                </PowerAction>
              </div>
            </div>
          </BallotDisclosure>
        )}

        {/* Submission route. The ballot is encrypted and proven locally either way — this only
            decides who sends the transaction, the voter or the CRISP server acting as relayer. */}
        {(canMask || (!voteDisabled && !isSubmitted)) && (
          <div className="flex flex-col gap-y-1 pt-2">
            <label className="flex items-center gap-x-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={submitOnChain}
                disabled={isDisabled || !canPublishOnChain}
                onChange={(e) => onChangeSubmitOnChain(e.target.checked)}
              />
              Send from my wallet (you pay gas)
            </label>
            <p className="text-xs text-neutral-500">
              {canPublishOnChain === false && onChainBlockedReason
                ? onChainBlockedReason
                : submitOnChain
                  ? "Your wallet sends the transaction, so the chain shows your address as the sender."
                  : "The CRISP server sends the transaction, so the chain shows the server as the sender. If the server cannot send it, your wallet is asked to."}
            </p>
          </div>
        )}

        <div className="vp-submission-results" aria-live="polite">
          {maskReceipts.length > 0 && (
            <BallotSuccess
              title={
                maskReceipts.length === 1
                  ? "Mask submitted successfully"
                  : `${maskReceipts.length} masks submitted successfully`
              }
              txHash={maskReceipts.length === 1 ? maskReceipts[0] : undefined}
            >
              {maskReceipts.length > 1 && maskReceipts.some((hash) => hash !== null) && (
                <ol className="mask-receipt-list">
                  {maskReceipts.map((hash, index) =>
                    hash ? (
                      <li key={hash}>
                        <a
                          className="ui-text-action"
                          href={`${PUB_CHAIN.blockExplorers?.default?.url}/tx/${hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Mask {index + 1} transaction
                        </a>
                      </li>
                    ) : null
                  )}
                </ol>
              )}
            </BallotSuccess>
          )}
          {attemptError && showFeedback && (
            <p className="vp-submission-error" role="alert">
              {submittedMode !== "mask"
                ? "Vote not submitted."
                : combinedFirst === "vote"
                  ? "Mask not submitted. Your vote was submitted successfully."
                  : combinedFirst === "mask"
                    ? "Mask not submitted. Your vote was not sent."
                    : maskRun && maskRun.total > 1
                      ? `Mask ${maskRun.current + 1} of ${maskRun.total} not submitted.${maskRun.sent ? ` ${maskRun.sent} sent before it.` : ""} The masks not sent stay in the list.`
                      : "Mask not submitted."}
            </p>
          )}
          {attemptError && showFeedback && submittedMode === "mask" && combinedFirst === "vote" && (
            <button
              type="button"
              className="vp-retry-mask"
              disabled={isDisabled}
              onClick={(event) => openReview(event.currentTarget, "mask")}
            >
              Try mask again
            </button>
          )}
        </div>

        {/* Feedback grows below the controls, keeping the option and action in place. */}
        <div
          className="proposal-disclosure vp-feedback"
          data-open={feedbackVisible}
          aria-hidden={!feedbackVisible}
          ref={feedbackRef}
        >
          <div className="proposal-disclosure-clip">
            {submittedMode && (
              <FluidHeight>
                <VotingStepIndicator
                  step={votingStep}
                  lastActiveStep={lastActiveStep}
                  message={stepMessage}
                  txHash={txHash}
                />
              </FluidHeight>
            )}
          </div>
        </div>
      </div>

      <BallotReview
        open={reviewOpen && (isReviewMasking ? canMask : !voteDisabled)}
        pending={busy}
        triggerRef={triggerRef}
        onClose={() => setReviewOpen(false)}
        proposalTitle={proposalTitle}
        choice={isReviewMasking ? "Mask" : selectedOption === null ? "" : options[selectedOption]}
        optionIndex={selectedOption ?? 0}
        isMask={isReviewMasking}
        emphasis={isReviewMasking ? "standard" : "choice"}
        signatureExpanded={signatureExpanded}
        detailView={
          isReviewMasking
            ? undefined
            : {
                open: signatureExpanded,
                title: "Signature data",
                content: signatureRequest && (
                  <SignatureData request={signatureRequest} notes={SIGNATURE_NOTES} pending={COMMITMENT_PENDING} />
                ),
                onBack: () => setSignatureExpanded(false),
                triggerRef: signatureTrigger,
              }
        }
        footer={
          <PowerAction
            intent={isReviewMasking ? "confirm" : "vote"}
            disabled={
              isDisabled || (isReviewMasking ? reviewMasksInvalid : voteDisabled || !reviewWeight || toolTargetInvalid)
            }
            onClick={() => void (isReviewMasking ? confirmMasks() : confirmVote())}
          >
            {isReviewMasking
              ? maskCount === 1
                ? "Submit mask ballot"
                : `Submit ${maskCount} mask ballots`
              : sendWithAnotherWallet
                ? "Sign and save ballot"
                : includeMask
                  ? sendFirst === "mask"
                    ? "Mask and vote"
                    : "Vote and mask"
                  : voteReceipt
                    ? "Update vote"
                    : "Submit encrypted ballot"}
          </PowerAction>
        }
      >
        {isReviewMasking && reviewSource === "tool" ? (
          // The "Add a mask" tool's mask sent alone: its recipient can still change here.
          maskRecipient
        ) : isReviewMasking ? (
          <div className="ballot-mask-target">
            <span className="mask-review-label">
              {maskCount === 1 ? "Mask recipient" : `${maskCount} mask recipients`}
            </span>
            <ol className="mask-review-list">
              {reviewMasks.map((entry, index) => (
                <li key={entry.id} data-invalid={recipientInvalid(entry.mode, entry.target)}>
                  {maskCount > 1 && <span className="mask-review-index">Mask {index + 1}</span>}
                  {entry.mode === "random" ? (
                    <span>Random eligible voter</span>
                  ) : isAddress(entry.target.trim()) ? (
                    <AddressText>{entry.target.trim()}</AddressText>
                  ) : (
                    <span>No wallet selected</span>
                  )}
                </li>
              ))}
            </ol>
            {recipientError ? (
              <p className="vp-submission-error" role="alert">
                Could not load the eligible voters from the CRISP server.
              </p>
            ) : (
              reviewMasksInvalid &&
              recipients && (
                <p className="vp-submission-error" role="alert">
                  Choose an eligible wallet for each mask in the list, or remove the mask.
                </p>
              )
            )}
            <p>
              {maskCount === 1
                ? "Adds cover for voters without changing any votes."
                : "Each mask is a separate submission, sent in this order. Random recipients are chosen when you confirm, each a different voter where the census allows."}
            </p>
          </div>
        ) : (
          <PrivacyReview
            rows={
              <>
                <PrivacyReviewRow
                  tool={randomizeWeight ? "Randomize voting power" : "Randomization off · Full voting power"}
                  icon={randomizeIcon}
                  active={randomizeWeight}
                  label="Your voting power"
                  value={
                    power ? (
                      <PowerShare share={power.share} counted={power.counted} randomized={power.randomized} />
                    ) : weightError ? (
                      "Unavailable"
                    ) : (
                      "Calculating…"
                    )
                  }
                  explanation={
                    power && {
                      content: (
                        <PowerCalculation snapshot={power.snapshot} share={power.share} counted={power.counted}>
                          {power.notes.map((note) => (
                            <p key={note}>{note}</p>
                          ))}
                        </PowerCalculation>
                      ),
                      labelHelp: "How your voting power is calculated",
                      valueHelp: `How ${power.counted} is calculated`,
                    }
                  }
                />
                {includeMask && (
                  <PrivacyReviewRow
                    tool="Add a mask"
                    icon={<MaskIcon />}
                    active={true}
                    label="Mask recipient"
                    value={
                      targetMode === "random" ? (
                        "Random eligible voter"
                      ) : isAddress(targetInput.trim()) ? (
                        <AddressText>{targetInput.trim()}</AddressText>
                      ) : (
                        "No wallet selected"
                      )
                    }
                  />
                )}
                {sendWithAnotherWallet && (
                  <PrivacyReviewRow
                    tool="Send from another wallet"
                    icon={<ActionIcon name="send" />}
                    active={true}
                    label="Sending wallet"
                    value="Another wallet"
                  />
                )}
              </>
            }
          >
            <p className="sr-only" aria-live="polite">
              {power && `Your voting power: ${power.share}, ${power.counted}`}
            </p>
            {weightError && (
              <div role="alert">
                <p className="vp-submission-error">{weightError}</p>
                <PowerAction size="compact" onClick={() => setWeightAttempt((attempt) => attempt + 1)}>
                  Try again
                </PowerAction>
              </div>
            )}
            {/* A recipient that cannot receive the mask is fixed here, without leaving the review. */}
            {toolTargetInvalid && (recipientError ?? recipients) && maskRecipient}
            <SubmissionSteps steps={submissionSteps} />
            {includeMask && (
              <div className="ballot-mask-target">
                <ChoiceMenu
                  label="Send order"
                  value={sendFirst}
                  onChange={setSendFirst}
                  disabled={busy}
                  options={[
                    { value: "vote", label: "Vote first" },
                    { value: "mask", label: "Mask first" },
                  ]}
                />
                <p>Selected at random for each ballot. A fixed order can show which submission is your vote.</p>
              </div>
            )}
            {signatureRequest && (
              <SignatureDataEntry
                ref={signatureTrigger}
                network={PUB_CHAIN.name}
                onClick={() => setSignatureExpanded(true)}
              />
            )}
          </PrivacyReview>
        )}
      </BallotReview>

      {(canMask || !voteDisabled) && (
        <div className="privacy">
          <span className="dot" />
          <div>
            Ballots are encrypted client-side and tallied under encryption within an Encrypted Execution Environment
            (E3). Individual votes are <em>never</em> revealed.
          </div>
        </div>
      )}
    </BallotPanel>
  );
};
