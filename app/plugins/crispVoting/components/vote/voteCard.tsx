import { BallotNetworkFee } from "@/components/proposalVoting/ballotNetworkFee";
import { BallotPowerPreviewContext, useBallotPresentation } from "@/components/proposalVoting/ballotPresentation";
import { BallotEditTransition } from "@/components/proposalVoting/BallotEditTransition";
import { useAccount } from "wagmi";
import { usePrivateVoteStatus, usePrivateVoteTransaction } from "../../hooks/usePrivateVoteStatus";
import { BallotSuccess } from "@/components/proposalVoting/ballotSuccess";
import { Spinner } from "@aragon/ods";
import { ballotWeightPercentage, draftBallotWeight, isUnchangedBallot, rerandomizeBallotWeight, type BallotWeight } from "../../utils/ballotWeight";
import { ballotSignatureRequest } from "../../utils/ballotDigest";
import { useCrispProgram } from "../../hooks/useCrispProgram";
import { displayNumber, groupThousands } from "@/utils/numbers";
import { SubmissionSummary, MaskSubmissionSummary, VoteChangeAction } from "./voteConfirmation";
import { BallotDisclosure } from "@/components/proposalVoting/ballotDisclosure";
import { VotingPowerAdjustment, VotingPowerPreview } from "./votingPowerAdjustment";
import { PUB_CHAIN, PUB_TOKEN_SYMBOL } from "@/constants";
import { ActionIcon } from "@/components/input/actionIcon";
import { maskReviewIssue } from "../../utils/maskReviewValidation";
import type { MaskTargetMode } from "./maskRecipientField";
import { MaskQueue, type MaskEntry } from "./maskQueue";
import { MaskRecipientsReview } from "./maskRecipientsReview";
import { changeOrderTool } from "./changeOrderTool";
import { useBallotReviewPresentation } from "@/components/proposalVoting/ballotReviewPresentation";
import { ChoiceMenu } from "@/components/input/choiceMenu";
import { unixTimestampToDate } from "../../utils/formatProposalDate";
import type { CreditsMode, EligibleVoter, VotingStep } from "../../utils/types";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, getAddress, type Address } from "viem";
import { Percent } from "@phosphor-icons/react";
import { AnimatedAmount } from "@/components/motion/AnimatedAmount";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { Disclosure } from "@/components/motion/Disclosure";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { useInert } from "@/components/motion/useInert";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { SegmentedControl } from "@/components/input/segmentedControl";
import VotingStepIndicator from "./voteProgress";
import { ProofStages } from "./proofStages";
import type { ProofProgressState } from "../../utils/proofProgress";
import {
  BallotPanel,
  BallotSubmissionInfo,
  BallotChoices,
  BallotReview,
  BallotIcon,
  MaskIcon,
} from "@/components/proposalVoting/ballot";
import {
  PowerCalculation,
  PowerShare,
  PrivacyReview,
  PrivacyReviewRow,
  PrivacyTools,
  SubmissionSteps,
  SubmissionOrder,
  type PrivacyTool,
} from "@/components/proposalVoting/privacyTools";
import { SignatureData, SignatureDataEntry } from "@/components/proposalVoting/signatureData";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { crispSdk } from "../../utils/crispSdk";
import { pickMaskRecipients } from "../../utils/voters";
import {
  reviewFirstBallot,
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
  `${displayNumber(formatUnits(raw, decimals), 2)} ${PUB_TOKEN_SYMBOL}`;

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
  getVoteWeight: (randomize: boolean, percentage?: number) => Promise<BallotWeight>;
  options: string[];
  voteStartDate: number;
  voteEndDate: number;
  disabled: boolean;
  isLoading: boolean;
  proposalId: bigint;
  votingStep: VotingStep;
  lastActiveStep: VotingStep | null;
  stepMessage: string;
  proofProgress: ProofProgressState | null;
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
  /** In-memory receipts that accompany a vote handed to another sending wallet. */
  onPreparedMaskReceipt?: (txHash: string | null) => void;
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
  onPreparedMaskReceipt,
  votingStep,
  lastActiveStep,
  stepMessage,
  proofProgress,
  isCommitteeReady,
  txHash,
  voteDisabled = false,
}: VoteCardProps) => {
  const { compact: compactReview, powerPresentation = "inline" } = useBallotReviewPresentation();
  const submissionRouteId = useId();
  const { address } = useAccount();
  const previousVoteStatus = usePrivateVoteStatus(e3Id, address);
  const previousVoteTxHash = usePrivateVoteTransaction(e3Id, address);
  const hasPreviousVote = previousVoteStatus === "confirmed" || previousVoteStatus === "submitted";
  // A mask adds cover independently of the selected voting option.
  const { power: ballotPowerPresentation, privacy: privacyPresentation } = useBallotPresentation();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submittedMode, setSubmittedMode] = useState<BallotKind | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  // Immediate feedback only: no vote choices, mask counters or history are persisted.
  const [voteReceipt, setVoteReceipt] = useState<{ txHash: string | null; option: number | null; weight?: BallotWeight }>();
  const [maskReceipts, setMaskReceipts] = useState<(string | null)[]>([]);
  const [attemptMaskReceipts, setAttemptMaskReceipts] = useState<(string | null)[]>([]);
  const [editingVote, setEditingVote] = useState(false);
  const [editRevision, setEditRevision] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [weightAdjustmentEnabled, setAdjustWeight] = useState(false);
  const adjustWeight = selectedOption !== null && weightAdjustmentEnabled;
  const privacyPresetApplied = useRef(false);
  const [weightMode, setWeightMode] = useState<"random" | "custom">("random");
  const [customPercentage, setCustomPercentage] = useState("100");
  const [randomWeight, setRandomWeight] = useState<BallotWeight>();
  const [draftWeightError, setDraftWeightError] = useState<string>();
  const randomizeWeight = adjustWeight && weightMode === "random";
  const selectedPercentage = adjustWeight && weightMode === "custom" ? Number(customPercentage) : undefined;
  const invalidPercentage =
    selectedPercentage !== undefined &&
    (!Number.isInteger(selectedPercentage) || selectedPercentage < 1 || selectedPercentage > 100);

  const [reviewWeight, setReviewWeight] = useState<BallotWeight>();
  const [weightError, setWeightError] = useState<string>();
  const [weightAttempt, setWeightAttempt] = useState(0);
  const [reviewMode, setReviewMode] = useState<BallotKind>("vote");
  const [maskEnabled, setIncludeMask] = useState(false);
  const includeMask = selectedOption !== null && maskEnabled;
  const [changeOrder, setChangeOrder] = useState(true);
  const [sendFirst, setSendFirst] = useState<BallotKind>("vote");
  const [otherWalletEnabled, setSendWithAnotherWallet] = useState(false);
  const sendWithAnotherWallet = selectedOption !== null && otherWalletEnabled;
  const nextMaskId = useRef(1);
  const [maskQueue, setMaskQueue] = useState<MaskEntry[]>([{ id: 0, mode: "random", target: "" }]);
  // Keep the same starting view for every wallet; eligibility is explained inside Ballot.
  const [submissionType, setSubmissionType] = useState<BallotKind>("vote");
  const [submitting, setSubmitting] = useState(false);
  const [attemptError, setAttemptError] = useState<string>();
  // The first submission of a vote + mask attempt. Null when the attempt sends one ballot.
  const [combinedFirst, setCombinedFirst] = useState<BallotKind | null>(null);
  // Progress of the current mask list, including masks accompanying a vote.
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
  useEffect(() => {
    if (!canMask) setSubmissionType("vote");
  }, [canMask]);
  const isSubmitted = !!voteReceipt && !editingVote;
  const isChangingVote = (!!voteReceipt || hasPreviousVote) && editingVote;
  const draftWeight = useMemo(() => {
    if (draftWeightError) return undefined;
    try { return draftBallotWeight(randomWeight, randomizeWeight, selectedPercentage); }
    catch { return undefined; }
  }, [randomWeight, randomizeWeight, selectedPercentage, draftWeightError]);
  const unchangedVote = isChangingVote && isUnchangedBallot(voteReceipt, selectedOption, draftWeight);
  const unchangedReview = isChangingVote && isUnchangedBallot(voteReceipt, selectedOption, reviewWeight);
  const showRememberedVote = hasPreviousVote && !voteReceipt && !editingVote;
  const busy = submitting || isLoading;
  // Failed attempts retain their unsent entries for a retry.
  const feedbackVisible = showFeedback && !busy && !!attemptError;
  const feedbackRef = useInert(!feedbackVisible);
  const isReviewMasking = reviewMode === "mask";
  const crispProgram = useCrispProgram(e3Id);

  // Pick once for this wallet and round; the review retains the amount already displayed.
  useEffect(() => {
    let cancelled = false;
    setRandomWeight(undefined);
    setDraftWeightError(undefined);
    void getVoteWeight(true).then(
      (weight) => {
        if (!cancelled) setRandomWeight(weight);
      },
      (error) => {
        if (!cancelled)
          setDraftWeightError(error instanceof Error ? error.message : "Could not load your voting power.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [getVoteWeight]);

  // The CRISP server's census is what the random pick draws from, and the chain still has the last
  // word: `handleMask` re-reads an ONCHAIN round's weight from the program before proving.
  const {
    data: census,
    error: recipientError,
    refetch: reloadRecipients,
  } = useQuery({
    queryKey: ["crisp-mask-candidates", e3Id?.toString()],
    queryFn: () => crispSdk.getEligibleAddresses(e3Id!),
    enabled: e3Id !== undefined && (includeMask || submissionType === "mask" || (reviewOpen && isReviewMasking)),
  });
  // The connected wallet stays in the list, so a voter can also mask their own slot.
  const recipients = useMemo<EligibleVoter[] | undefined>(
    () => census?.map((voter) => ({ address: voter.address, balance: BigInt(voter.balance) })),
    [census]
  );
  const recipientInvalid = (mode: MaskTargetMode, target: string) =>
    maskReviewIssue([{ mode, target }], recipients, !!recipientError) !== null;
  const reviewMasks = maskQueue;
  const maskIssue = maskReviewIssue(reviewMasks, recipients, !!recipientError);
  const reviewMasksInvalid = maskIssue !== null;
  const maskReviewHint = maskIssue === "loading" ? "Loading eligible voters before review…"
    : maskIssue === "unavailable" ? "Open Privacy extras to retry loading mask recipients."
    : maskIssue === "no-voters" ? "No eligible voters are available for masks. Remove masks to review your vote."
    : "Choose an eligible wallet for each mask in Privacy extras before reviewing.";
  const toolTargetInvalid = includeMask && reviewMasksInvalid;

  useEffect(() => {
    if (!reviewOpen || isReviewMasking) return;
    let cancelled = false;
    setReviewWeight(undefined);
    setWeightError(undefined);
    void getVoteWeight(randomizeWeight, selectedPercentage).then(
      (weight) => {
        if (cancelled) return;
        const sameBalance =
          randomWeight &&
          randomWeight.roundId === weight.roundId &&
          randomWeight.voter.toLowerCase() === weight.voter.toLowerCase() &&
          randomWeight.available === weight.available &&
          randomWeight.power === weight.power &&
          randomWeight.unit === weight.unit &&
          randomWeight.decimals === weight.decimals;
        if (randomizeWeight && sameBalance) {
          setReviewWeight({ ...weight, counted: randomWeight.counted });
        } else {
          setReviewWeight(weight);
          if (randomizeWeight) setRandomWeight(weight);
        }
      },
      (error: unknown) => {
        if (!cancelled) setWeightError(error instanceof Error ? error.message : "Could not load your voting power.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [reviewOpen, isReviewMasking, randomizeWeight, selectedPercentage, getVoteWeight, weightAttempt, randomWeight]);

  const openReview = (trigger: HTMLElement, kind: BallotKind) => {
    if (submittingRef.current || isDisabled) return;
    if ((kind === "mask" || includeMask) && reviewMasksInvalid) {
      if (kind === "mask") setSubmissionType("mask");
      return;
    }
    if (kind === "vote" && (voteDisabled || selectedOption === null || unchangedVote || invalidPercentage)) return;
    triggerRef.current = trigger;
    setReviewMode(kind);
    setReviewWeight(undefined);
    setWeightError(undefined);
    setSignatureExpanded(false);
    setSendFirst(reviewFirstBallot({ includeMask, anotherWallet: sendWithAnotherWallet, changeOrder }));
    setReviewOpen(true);
  };

  const startAttempt = () => {
    submittingRef.current = true;
    setSubmitting(true);
    setAttemptMaskReceipts([]);
    setReviewOpen(false);
    setAttemptError(undefined);
    setShowFeedback(true);
  };

  const confirmVote = async () => {
    if (
      submittingRef.current ||
      isDisabled ||
      voteDisabled ||
      selectedOption === null ||
      unchangedReview ||
      !reviewWeight ||
      invalidPercentage
    )
      return;
    if (toolTargetInvalid) return;
    // Fix all recipients before any submission, avoiding repeated random recipients where possible.
    const entries = includeMask ? maskQueue : [];
    const targets = entries.length ? pickMaskRecipients(
      entries.map((entry) => entry.mode === "address" ? entry.target.trim() : undefined), recipients!
    ).map((address) => getAddress(address)) : [];
    startAttempt();
    setEditingVote(true);
    setMaskRun(entries.length ? { total: entries.length, current: 0, sent: 0 } : null);
    // A mask must leave the voting wallet before a prepared vote hands over to another sender.
    const prepareVote = sendWithAnotherWallet ? onPrepareVote : undefined;
    const preparingVote = !!prepareVote;
    setCombinedFirst(includeMask ? (preparingVote ? "mask" : sendFirst) : null);
    const option = selectedOption;
    try {
      await submitBallotSequence({
        vote: () => (prepareVote ? prepareVote(option, reviewWeight) : onClickVote(option, reviewWeight)),
        masks: targets.map((target) => () => onClickMask(target)),
        first: preparingVote ? "mask" : sendFirst,
        isCurrent: () => mounted.current,
        onStart: (kind, index) => {
          setSubmittedMode(kind);
          if (kind === "mask") setMaskRun((run) => run && { ...run, current: index! });
        },
        onResult: (kind, result, index) => {
          if (!result.success) {
            setAttemptError(result.error);
            return;
          }
          if (kind === "mask") {
            if (preparingVote) onPreparedMaskReceipt?.(result.txHash);
            setMaskReceipts((previous) => [...previous, result.txHash]);
            setAttemptMaskReceipts((previous) => [...previous, result.txHash]);
            setMaskRun((run) => run && { ...run, sent: run.sent + 1 });
            removeSentMask(entries[index!].id);
            if (index === entries.length - 1) setIncludeMask(false);
            return;
          }
          // Preparation saves a signed ballot; only the other wallet's later send is a vote receipt.
          if (preparingVote) return;
          // A mask sent before the vote does not end the edit of that vote.
          setVoteReceipt({ txHash: result.txHash, option, weight: reviewWeight });
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
          setAttemptMaskReceipts((previous) => [...previous, result.txHash]);
          removeSentMask(entries[index].id);
          if (index === entries.length - 1) setIncludeMask(false);
        },
      });
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  const removeSentMask = (id: number) => setMaskQueue((queue) => {
    const rest = queue.filter((entry) => entry.id !== id);
    return rest.length ? rest : [{ id: nextMaskId.current++, mode: "random", target: "" }];
  });

  const addMask = () => setMaskQueue((queue) => [...queue, { id: nextMaskId.current++, mode: "random", target: "" }]);

  const editSubmission = () => {
    privacyPresetApplied.current = true;
    setEditRevision(revision => revision + 1);
    setSubmissionType("vote");
    setEditingVote(true);
    setSelectedOption(voteReceipt?.option ?? null);
    const weight = voteReceipt?.weight;
    if (weight) {
      setAdjustWeight(weight.randomize || weight.percentage !== undefined);
      setWeightMode(weight.percentage !== undefined ? "custom" : "random");
      setCustomPercentage(String(weight.percentage ?? 100));
      if (weight.randomize) setRandomWeight(weight);
    }
    setIncludeMask(false);
    setShowFeedback(false);
  };

  const votingClosed = voteEndDate <= Math.round(Date.now() / 1000);
  const isDisabled = disabled || busy || votingClosed;
  const notStarted = voteStartDate > Math.round(Date.now() / 1000);
  const started = voteStartDate < Math.round(Date.now() / 1000);

  const setMaskTool = (checked: boolean) => {
    // Preserve the shared draft when toggling the tool or switching between Ballot and Mask.
    setIncludeMask(checked);
  };

  const setOtherWallet = (checked: boolean) => {
    setSendWithAnotherWallet(checked);
  };

  // Both entry points edit the same list and use the same shared recipient controls.
  const maskRecipient = (
    <FluidHeight>
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
        isInvalid={(entry) => entry.mode === "address" && !!recipients?.length && !recipientError && recipientInvalid(entry.mode, entry.target)}
      />
    </FluidHeight>
  );

  const privacyTools: PrivacyTool[] = [
    {
      id: "randomize",
      title: "Adjust voting power",
      description:
        weightMode === "custom"
          ? `Use ${customPercentage}%`
          : randomWeight
            ? `${ballotWeightPercentage(randomWeight)} · Random`
            : "Random · 99–100%",
      hint:
        adjustWeight && weightMode === "custom"
          ? `Use ${customPercentage}% of your voting power.`
          : "Randomize or choose the percentage of voting power to use.",
      icon: randomizeIcon,
      checked: adjustWeight,
      info: (
        <p>
          Use a random 99–100% or choose any whole percentage from 1% to 100% of your voting power. Reducing the weight
          can make a vote harder to identify in the tally, especially when few people vote. A lower percentage also
          gives your vote less weight. Select Randomize for a new value, or edit the percentage directly.
        </p>
      ),
      details: (
        <VotingPowerAdjustment
          mode={weightMode}
          percentage={customPercentage}
          onModeChange={setWeightMode}
          onPercentageChange={setCustomPercentage}
          onRandomize={() => setRandomWeight((weight) => weight && rerandomizeBallotWeight(weight))}
          balance={randomWeight}
          balanceError={draftWeightError}
        />
      ),
      onChange: setAdjustWeight,
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
            info: (
              <p>
                A mask adds cover without voting power. It is sent separately from your vote and does not change the
                option you chose. Choose who receives the cover below.
              </p>
            ),
            details: (
              <div className="vp-path">
                {maskRecipient}
                <button type="button" className="ui-text-action inline-flex items-center gap-1.5 self-start"
                  disabled={isDisabled || reviewMasksInvalid}
                  onClick={(event) => openReview(event.currentTarget, "mask")}>
                  <ActionIcon name="send" />
                  {maskQueue.length === 1 ? "Send mask only" : "Send masks only"}
                </button>
              </div>
            ),
            onChange: setMaskTool,
          },
          ...(!compactReview ? [changeOrderTool({
            includeMask,
            anotherWallet: sendWithAnotherWallet,
            enabled: changeOrder,
            onChange: setChangeOrder,
          })] : []),
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
                send or discard it. If you add a mask, it is sent from your voting wallet before you switch.
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
    randomized: reviewWeight.randomize || reviewWeight.percentage !== undefined,
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

  // Keep the entire commitment beside the confirmation action, even when details scroll.
  const maskReviewStep = { icon: <MaskIcon />, title: maskQueue.length === 1 ? "Send mask" : `Send ${maskQueue.length} masks`, text: "One at a time" };
  const voteReviewStep = { icon: <BallotIcon />, title: sendWithAnotherWallet ? "Sign vote" : "Send vote", text: "Encrypted" };
  const reviewSequence = sendWithAnotherWallet
    ? [...(includeMask ? [maskReviewStep] : []), voteReviewStep,
        { title: "Switch wallet", text: "Pays gas", icon: <ActionIcon name="send" /> }, { title: "Send vote", text: "Signed ballot", icon: <BallotIcon /> }]
    : includeMask
      ? sendFirst === "mask" ? [maskReviewStep, voteReviewStep] : [voteReviewStep, maskReviewStep]
      : [voteReviewStep];

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
  // Formatting is local to the comparison; keep exact string precision and shared digit motion.
  const compactPowerReduced = !!reviewWeight && reviewWeight.counted < reviewWeight.available;
  const compactPowerHelp = powerPresentation === "share" || compactPowerReduced || !!power?.notes.length;
  const compactCounted = power ? powerPresentation === "share" ? power.share : groupThousands(power.counted) : undefined;
  const compactMaskDetail = recipientError ? (
    <div className="ballot-review-issue" role="alert">
      <p className="vp-submission-error">Unable to load eligible voters. Your recipients have not been verified.</p>
      <PowerAction size="compact" onClick={() => void reloadRecipients()}>Try again</PowerAction>
    </div>
  ) : !recipients ? (
    <span className="ballot-review-status" role="status"><Spinner size="sm" variant="neutral" />Loading eligible voters…</span>
  ) : !recipients.length ? (
    <p className="vp-submission-error" role="alert">No eligible voters are available for this proposal.</p>
  ) : reviewMasksInvalid ? (
    <MaskQueue entries={reviewMasks} onChange={setMaskQueue} onAdd={addMask} recipients={recipients}
      recipientError={false} onRetry={() => void reloadRecipients()} pending={busy}
      creditMode={creditMode} e3Id={e3Id} review isInvalid={entry => recipientInvalid(entry.mode, entry.target)} />
  ) : <MaskRecipientsReview entries={reviewMasks} embedded />;
  const compactVoteStep: { icon: ReactNode; title: string; detail?: ReactNode } = sendWithAnotherWallet ? {
    icon: <BallotIcon />,
    title: "Vote",
    detail: <ol className="ballot-review-vote-stages" aria-label="Vote stages">
      <li><span>First step</span><ActionIcon name="sign" /><span>Sign and save your vote</span></li>
      <li><span>Second step</span><ActionIcon name="send" /><span>Send from another wallet</span></li>
    </ol>,
  } : voteReviewStep;
  const compactSequence = (isReviewMasking ? [maskReviewStep]
    : sendWithAnotherWallet ? [...(includeMask ? [maskReviewStep] : []), compactVoteStep]
    : reviewSequence).map(step => ({
      ...step,
      detail: step === maskReviewStep ? compactMaskDetail : step === compactVoteStep && sendWithAnotherWallet ? compactVoteStep.detail : undefined,
    }));
  const queueCount = maskQueue.length;

  const showVoteSummary = isSubmitted && !!voteReceipt;
  const showMaskSummary = !busy && showFeedback && !attemptError && combinedFirst === null &&
    submittedMode === "mask" && !!maskRun && maskRun.sent === maskRun.total;
  const showCompletedSummary = showVoteSummary || showMaskSummary || showRememberedVote;
  const activeVote = busy && (combinedFirst !== null || maskRun === null);
  const showSummary = busy || showVoteSummary || showMaskSummary || (feedbackVisible && attemptMaskReceipts.length > 0);
  const voteFromAnotherWallet = submissionType === "vote" && sendWithAnotherWallet;
  const progressMessage =
    votingStep === "generating_proof"
      ? `${stepMessage || (submittedMode === "mask" ? "Encrypting mask…" : "Encrypting your ballot…")} This can take several minutes, depending on your device. Keep this page open while it runs.`
      : stepMessage;

  return (
    <BallotEditTransition revision={editRevision} data-submission-busy={busy} layoutKey={`${busy ? "pending" : "idle"}-${submissionType}-${showCompletedSummary ? "submitted" : "form"}`}>
      <BallotPanel
        title={
          busy || showCompletedSummary
            ? undefined
            : submissionType === "mask"
              ? "Send masks"
              : voteDisabled && !canMask
                ? "Voting"
                : isChangingVote
                  ? "Change your vote"
                  : "Cast your vote"
        }
        navigation={
          canMask && !busy && !showCompletedSummary && (
            <SegmentedControl<BallotKind>
              label="Submission type"
              value={submissionType}
              options={[
                { value: "vote", label: "Vote", icon: <BallotIcon /> },
                { value: "mask", label: "Masks only", icon: <MaskIcon /> },
              ]}
              onChange={setSubmissionType}
            />
          )
        }
        submitted={showCompletedSummary && !busy}
        info={
          !busy &&
          !showCompletedSummary &&
          (canMask || !voteDisabled) && (
            <BallotSubmissionInfo
              submitOnChain={submitOnChain}
              anotherWallet={voteFromAnotherWallet}
              includeMask={includeMask}
            />
          )
        }
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

          {showRememberedVote && !busy && (
            <BallotSuccess
              title={previousVoteStatus === "confirmed" ? "Vote confirmed" : "Vote submitted"}
              txHash={previousVoteTxHash}
              action={<VoteChangeAction disabled={voteDisabled || isDisabled} votingClosed={votingClosed} onChange={editSubmission} />}
            >
              {previousVoteStatus === "confirmed"
                ? "You’ve already voted on this proposal. Your choice remains private."
                : "The relayer received your ballot. On-chain confirmation is still unavailable."}
            </BallotSuccess>
          )}
          {showSummary && (
            <SubmissionSummary
              busy={busy}
              activeKind={submittedMode ?? "vote"}
              includeVote={activeVote || showVoteSummary}
              includeMask={maskRun !== null}
              first={combinedFirst ?? "vote"}
              voteReceipt={showVoteSummary ? voteReceipt : undefined}
              option={
                activeVote
                  ? selectedOption === null
                    ? undefined
                    : options[selectedOption]
                  : showVoteSummary && voteReceipt.option !== null
                    ? options[voteReceipt.option]
                    : undefined
              }
              maskReceipts={attemptMaskReceipts}
              maskRun={maskRun}
              detail={progressMessage || (submittedMode === "mask" ? "Encrypting mask…" : "Encrypting your ballot…")}
              preparing={sendWithAnotherWallet && (activeVote || showVoteSummary)}
              maskAction={showMaskSummary ? <PowerAction size="compact" onClick={() => setShowFeedback(false)}>Send another mask</PowerAction> : undefined}
              voteAction={showVoteSummary && !busy && !voteDisabled && !isDisabled && !votingClosed ? (
                <VoteChangeAction disabled={false} votingClosed={false} onChange={editSubmission} />
              ) : undefined}
            />
          )}

          {busy && votingStep === "generating_proof" && proofProgress && <ProofStages progress={proofProgress} />}

          {/* Hide editable controls for the complete submission sequence. */}
          {!busy && !showCompletedSummary && (
            <div className="ballot-draft">
              {/* A mask is an action of its own: each has its own view. */}
              <FluidHeight>
                <div className="motion-tab-panels">
                  <MotionPanel active={!canMask || submissionType === "vote"} direction="left">
                    <div className="vp-path">
                      {!isSubmitted && (
                        <BallotPowerPreviewContext.Provider value={!voteDisabled && ballotPowerPresentation !== "original"
                          ? (snapshot, info, warning) => <VotingPowerPreview balance={randomWeight} error={draftWeightError}
                              adjusted={adjustWeight} mode={weightMode} percentage={customPercentage}
                              presentation={ballotPowerPresentation} snapshot={snapshot} info={info} warning={warning} />
                          : null}>
                          {votingPower}
                        </BallotPowerPreviewContext.Provider>
                      )}
                      {!isSubmitted && !voteDisabled && ballotPowerPresentation === "original" && (
                        <VotingPowerPreview balance={randomWeight} error={draftWeightError}
                          adjusted={adjustWeight} mode={weightMode} percentage={customPercentage} />
                      )}
                      {voteDisabled && !isSubmitted && (
                        <>
                          {notice ? (
                            <p className="vp-foot-note" style={{ textAlign: "left" }}>
                              {notice}
                            </p>
                          ) : (
                            eligibilityNotice
                          )}
                          {canMask && <p className="vp-note">You can still help protect voter privacy using Masks only above.</p>}
                        </>
                      )}
                      {!isSubmitted && !voteDisabled ? (
                        <div>
                        <BallotChoices
                          options={options}
                          presentation="framed"
                          value={selectedOption}
                          currentVote={voteReceipt?.option}
                          onChange={(choice) => {
                            if (typeof choice !== "number") return;
                            // Apply the starting privacy preset once, only after an explicit vote choice.
                            // Switching choices or clearing/reselecting preserves subsequent user edits.
                            if (!privacyPresetApplied.current && selectedOption === null && !editingVote) {
                              privacyPresetApplied.current = true;
                              setAdjustWeight(true);
                              setIncludeMask(canMask);
                            }
                            setSelectedOption(choice);
                          }}
                          onClear={() => setSelectedOption(null)}
                          disabled={isDisabled}
                          voteDisabled={voteDisabled}
                        />
                        <Disclosure open={privacyPresentation !== "after-choice" || selectedOption !== null}>
                          <div className="ballot-privacy-reveal"><PrivacyTools tools={privacyTools} disabled={isDisabled} /></div>
                        </Disclosure>
                        </div>
                      ) : null}

                      {!voteDisabled && !isSubmitted && (
                        <div className="vp-cta">
                            {toolTargetInvalid && <p className="vp-note" role="status">{maskReviewHint}</p>}
                            <PowerAction
                              className="ballot-primary-action"
                              intent="vote"
                              disabled={isDisabled || selectedOption === null || unchangedVote || invalidPercentage || toolTargetInvalid}
                              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                                openReview(event.currentTarget, "vote")
                              }
                            >
                              <span className="vp-label-change" key={`vote-${selectedOption}`}>
                                {selectedOption !== null
                                  ? includeMask
                                    ? voteReceipt
                                      ? `Review updated vote + ${queueCount === 1 ? "mask" : `${queueCount} masks`}`
                                      : `Review vote + ${queueCount === 1 ? "mask" : `${queueCount} masks`}`
                                    : voteReceipt
                                      ? "Review updated vote"
                                      : "Review vote"
                                  : "Choose an option"}
                              </span>
                            </PowerAction>
                        </div>
                      )}
                    </div>
                  </MotionPanel>

                  {canMask && (
                    <MotionPanel active={submissionType === "mask"} direction="right">
                      <div className="vp-path">
                        <p className="vp-note">
                          Help protect voter privacy without casting a vote. Masks add no voting power and do not
                          change any vote.
                        </p>
                        {maskRecipient}
                        <div className="vp-cta">
                          <PowerAction
                            className="ballot-primary-action"
                            intent="vote"
                            disabled={isDisabled || reviewMasksInvalid}
                            onClick={(event: MouseEvent<HTMLButtonElement>) =>
                              openReview(event.currentTarget, "mask")
                            }
                          >
                            <span className="vp-label-change" key={`masks-${queueCount}`}>
                              {queueCount === 1 ? "Review mask" : `Review ${queueCount} masks`}
                            </span>
                          </PowerAction>
                        </div>
                      </div>
                    </MotionPanel>
                  )}
                </div>
              </FluidHeight>

              {/* Submission route. The ballot is encrypted and proven locally either way — this only
            decides who sends the transaction, the voter or the CRISP server acting as relayer. */}
              {(submissionType === "mask" || (!voteDisabled && !isSubmitted && (!voteFromAnotherWallet || includeMask))) && (
                <BallotNetworkFee
                  id={`${submissionRouteId}-wallet`}
                  checked={submitOnChain}
                  masksOnly={voteFromAnotherWallet}
                  disabled={isDisabled || !canPublishOnChain}
                  unavailable={canPublishOnChain === false ? onChainBlockedReason : undefined}
                  onChange={onChangeSubmitOnChain}
                />
              )}
            </div>
          )}

          {!busy && !showCompletedSummary && maskReceipts.length > 0 && (
            <BallotDisclosure title="Earlier mask submissions">
              <MaskSubmissionSummary receipts={maskReceipts} />
            </BallotDisclosure>
          )}

          <div className="vp-submission-results" aria-live="polite">
            {attemptError && showFeedback && (
              <p className="vp-submission-error" role="alert">
                {submittedMode !== "mask"
                  ? sendWithAnotherWallet
                    ? "Vote not prepared."
                    : "Vote not submitted."
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
                    message={progressMessage}
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
          choice={isReviewMasking ? (maskCount === 1 ? "1 mask" : `${maskCount} masks`) : selectedOption === null ? "" : options[selectedOption]}
          previousChoice={compactReview && !isReviewMasking && voteReceipt?.option != null ? options[voteReceipt.option] : undefined}
          choiceDetail={compactReview && !isReviewMasking ? (
            power ? <>{(powerPresentation !== "inline") && <span className="ballot-review-power-label">Voting power</span>}<span className="ballot-review-power-value">{compactPowerHelp && <PowerInfo label="How your voting power is calculated" compact={true}
              contentClassName={powerPresentation === "share" ? "power-info-popover--amount" : ""}
              trigger={powerPresentation !== "share" && compactPowerReduced ? <Percent size={16} aria-hidden="true" /> : undefined}>
              <PowerCalculation snapshot={power.snapshot} share={power.share} counted={power.counted} summary={powerPresentation === "share"}>
                {power.notes.map(note => <p key={note}>{note}</p>)}
              </PowerCalculation>
            </PowerInfo>}<span className="ballot-review-power-amount" data-wide={(compactCounted?.length ?? 0) > 20 || undefined}><span className="ballot-review-power-baseline" aria-hidden="true">{compactCounted}</span><span className="ballot-review-power-animation"><AnimatedAmount plain={true} value={compactCounted!} /></span></span></span></> : weightError ? (
              <div className="ballot-review-issue" role="alert"><span>Unable to load voting power.</span>
                <button type="button" className="ui-text-action" onClick={() => setWeightAttempt(attempt => attempt + 1)}>Try again</button>
              </div>
            ) : <span className="ballot-review-status" role="status"><Spinner size="sm" variant="neutral" />Calculating voting power…</span>
          ) : undefined}
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
          footerContext={!compactReview && <>
            <SubmissionSteps compact steps={isReviewMasking ? [maskReviewStep] : reviewSequence} />
            <p className="ballot-review-next">
              {isReviewMasking || (includeMask && sendFirst === "mask")
                ? submitOnChain ? "Next: confirm the mask transaction in your wallet." : maskCount === 1 ? "Next: your mask is prepared and sent automatically." : "Next: masks are prepared and sent automatically."
                : "Next: sign your encrypted vote in your wallet."}
              {sendWithAnotherWallet ? " The sending wallet pays gas for the vote." : submitOnChain ? " You pay the gas fee." : " Interfold covers gas."}
            </p>
          </>}
          footer={
            <>
            <PowerAction
              intent={compactReview ? "vote" : isReviewMasking ? "confirm" : "vote"}
              disabled={
                isDisabled ||
                (isReviewMasking ? reviewMasksInvalid : voteDisabled || selectedOption === null || unchangedReview || !reviewWeight || toolTargetInvalid)
              }
              onClick={() => void (isReviewMasking ? confirmMasks() : confirmVote())}
            >
              {isReviewMasking
                ? maskCount === 1
                  ? "Send mask"
                  : `Send ${maskCount} masks`
                : sendWithAnotherWallet
                  ? includeMask
                    ? `Send ${maskCount === 1 ? "mask" : `${maskCount} masks`} and prepare vote`
                    : "Sign and save ballot"
                  : includeMask
                    ? sendFirst === "mask"
                      ? maskCount === 1 ? "Mask and vote" : `Send ${maskCount} masks and vote`
                      : maskCount === 1 ? "Vote and mask" : `Vote and send ${maskCount} masks`
                    : voteReceipt
                      ? "Update vote"
                      : compactReview ? "Send vote" : "Submit encrypted ballot"}
            </PowerAction>
            </>
          }
        >
          {compactReview ? (
            <div className="ballot-review-compact-details">
              {(isReviewMasking || sendWithAnotherWallet || compactSequence.length > 1) && <FluidHeight>
                <SubmissionOrder steps={compactSequence} disabled={busy}
                  reverseUnavailableReason={sendWithAnotherWallet ? "Masks must be sent from your voting wallet before signing and saving the vote opens the handoff to another wallet." : undefined}
                  onReverse={!isReviewMasking && includeMask ? () => setSendFirst(first => first === "vote" ? "mask" : "vote") : undefined} />
              </FluidHeight>}
              {(submitOnChain || (!isReviewMasking && sendWithAnotherWallet)) && <p className="ballot-review-fees">
                {!isReviewMasking && sendWithAnotherWallet
                  ? submitOnChain && includeMask ? "You pay gas for the masks. The other wallet pays gas for the vote." : "The other wallet pays gas for the vote."
                  : "You pay gas for this submission. Review the fee in your wallet."}
              </p>}
              {signatureRequest && <SignatureDataEntry compact ref={signatureTrigger} network={PUB_CHAIN.name} onClick={() => setSignatureExpanded(true)} />}
            </div>
          ) : isReviewMasking ? (
            <div className="ballot-mask-target">
              <MaskRecipientsReview entries={reviewMasks} isInvalid={(entry) => recipientInvalid(entry.mode, entry.target)} />
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
              {reviewMasksInvalid && maskRecipient}
              <p>
                {maskCount === 1
                  ? "Adds cover for voters without changing any votes."
                  : "Grouped by recipient. Each mask is sent separately in your original order. Random recipients are chosen when you confirm, each a different voter where the census allows."}
              </p>
            </div>
          ) : (
            <PrivacyReview
              rows={
                <>
                  {!compactReview && <PrivacyReviewRow
                    tool={
                      selectedPercentage !== undefined
                        ? "Custom voting power"
                        : randomizeWeight
                          ? "Randomize voting power"
                          : "Full voting power"
                    }
                    icon={randomizeIcon}
                    active={adjustWeight}
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
                  />}
                  {includeMask && (!compactReview || toolTargetInvalid || maskQueue.some(entry => entry.mode === "address")) && (
                    <MaskRecipientsReview entries={maskQueue} isInvalid={(entry) => recipientInvalid(entry.mode, entry.target)} />
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
              {!compactReview && includeMask && !sendWithAnotherWallet && (
                <div className="ballot-mask-target">
                  <ChoiceMenu
                    label="Send order"
                    value={sendFirst}
                    onChange={(first) => {
                      setSendFirst(first);
                      if (first === "mask") setChangeOrder(true);
                    }}
                    disabled={busy}
                    options={[
                      { value: "vote", label: "Vote first" },
                      { value: "mask", label: maskCount === 1 ? "Mask first" : "Masks first" },
                    ]}
                  />
                  <p>
                    {changeOrder
                      ? "Change order is on. The initial order is chosen at random; you can adjust it here."
                      : "Change order is off. Your vote goes first; choosing masks first here turns it on."}
                  </p>
                </div>
              )}
              {compactReview && <SubmissionOrder steps={reviewSequence} disabled={busy}
                onReverse={includeMask && !sendWithAnotherWallet ? () => setSendFirst(first => first === "vote" ? "mask" : "vote") : undefined}/>}
              {signatureRequest && (
                <SignatureDataEntry compact={compactReview} ref={signatureTrigger} network={PUB_CHAIN.name} onClick={() => setSignatureExpanded(true)}/>
              )}
            </PrivacyReview>
          )}
        </BallotReview>

      </BallotPanel>
    </BallotEditTransition>
  );
};
