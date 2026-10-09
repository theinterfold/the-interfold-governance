import { ClosedVoteStatus } from "@/components/proposalVoting/closedVoteStatus";
import { usePrivateVoteStatus } from "../hooks/usePrivateVoteStatus";
import type { BallotWeight } from "../utils/ballotWeight";
import { ProposalDetailLayout } from "@/components/proposal/proposalDetailLayout";
import { ProposalBreadcrumb } from "@/components/proposal/proposalReadingHeader";
import { e3RoundNumber } from "../utils/ballotDigest";
import { useProposal } from "../hooks/useProposal";
import { PUB_ENABLE_LOCKING } from "@/constants";
import {
  INSTALLED_PRIVATE_PAIR,
  PrivatePairProvider,
  RETIRED_PRIVATE_PAIR,
  usePrivatePair,
} from "../hooks/usePrivatePair";
import ProposalHeader from "../components/proposal/header";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { useProposalStatus } from "../hooks/useProposalStatus";
import type { Address } from "viem";
import { ElseIf, If, Then } from "@/components/if";
import { AlertCard, ProposalStatus } from "@aragon/ods";
import { useAccount } from "wagmi";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { ADDRESS_ZERO } from "@/utils/evm";
import { AddressText } from "@/components/text/address";
import { SelfDelegateLink } from "@/components/text/selfDelegate";
import { useCanVote } from "../hooks/useCanVote";
import { useSnapshotVotingPower } from "@/hooks/useSnapshotVotingPower";
import { BallotEligibilityNotice } from "@/components/proposalVoting/ballotEligibility";
import { VoteCard } from "../components/vote/voteCard";
import { PreparedVoteCard } from "../components/vote/preparedVoteCard";
import { SubmittedVoteCard } from "../components/vote/submittedVoteCard";
import { useWalletModal } from "@/hooks/useWalletModal";
import { UncountedFoldNotice } from "@/plugins/velocker/components/uncountedFoldNotice";
import { useCrispServer } from "../hooks/useCrispServer";
import { VoteResultCard } from "../components/vote/voteResultCard";
import { RefundCard } from "../components/fee/refundCard";
import { useEffect, useMemo, useRef, useState } from "react";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { getSppStatusOverride } from "@/plugins/spp/utils/status";
import { proposalPresentation } from "@/plugins/governance/utils/proposalPresentation";
import { useProposalBoundaryClock } from "@/plugins/governance/utils/useProposalBoundaryClock";
import { VetoStageCard } from "@/plugins/spp/components/vetoStageCard";
import { UnavailableProposalDetail } from "@/components/proposal/unavailableProposalDetail";
import { VotingPower } from "@/plugins/tokenVoting/components/votingPower";
import { ParticipationCard } from "../components/participationCard";
import { ActivityCard } from "../components/activityCard";
import { NetworkProgress } from "../components/networkProgress";
import type { PreparedBallot } from "../utils/preparedBallot";
import type { PreparedVoteReceipt } from "../utils/ballotSubmission";

const ZERO = BigInt(0);

/** `index` is the SPP (staged process) proposal id; the CRISP sub-proposal id is resolved on-chain. */
export default function ProposalDetail({
  index: sppProposalId,
  embedded = false,
}: {
  index: bigint;
  embedded?: boolean;
}) {
  const pair = usePrivatePair();
  const spp = useSppProposal("private", sppProposalId);

  if (spp.missing) {
    // A replacement install moves new proposals to a new pair, but the retired pair's proposals
    // keep their route. Look for the id there before reporting it as missing.
    if (pair === INSTALLED_PRIVATE_PAIR && RETIRED_PRIVATE_PAIR) {
      return (
        <PrivatePairProvider value={RETIRED_PRIVATE_PAIR}>
          <ProposalDetail index={sppProposalId} embedded={embedded} />
        </PrivatePairProvider>
      );
    }
    return (
      <UnavailableProposalDetail
        proposalId={sppProposalId}
        status="Not found"
        message="This private proposal does not exist on-chain."
        embedded={embedded}
      />
    );
  }
  if (spp.subProposalFailed) {
    return (
      <UnavailableProposalDetail
        proposalId={sppProposalId}
        status="Creation failed"
        message="The voting sub-proposal could not be created on the CRISP plugin."
        embedded={embedded}
      />
    );
  }
  if (spp.error) {
    return (
      <UnavailableProposalDetail
        proposalId={sppProposalId}
        status="Unavailable"
        message="Could not load this private proposal. Check your connection and try again."
        embedded={embedded}
        onRetry={() => void spp.retry()}
      />
    );
  }
  if (spp.subProposalId === undefined) {
    return (
      <section className="flex w-full min-w-0">
        <PleaseWaitSpinner />
      </section>
    );
  }

  return (
    <ProposalDetailBody proposalIdx={spp.subProposalId} sppProposalId={sppProposalId} spp={spp} embedded={embedded} />
  );
}

function ProposalDetailBody({
  proposalIdx,
  sppProposalId,
  spp,
  embedded,
}: {
  proposalIdx: bigint;
  sppProposalId: bigint;
  spp: ReturnType<typeof useSppProposal>;
  embedded: boolean;
}) {
  const { address } = useAccount();
  const { body } = usePrivatePair();
  const { open: openWallet } = useWalletModal();
  // The CRISP server sends ballots by default. The voter can send from the wallet instead.
  const [submitOnChain, setSubmitOnChain] = useState(false);
  const {
    proposal,
    isCommitteeReady,
    networkProgress,
    totalVotingPower,
    e3Failed,
    e3FailurePending,
    e3FailureReason,
    status: proposalFetchStatus,
  } = useProposal(proposalIdx, { metadataUri: spp.metadataUri, creator: spp.creator });
  const {
    isLoading,
    error,
    postVote,
    getVoteWeight,
    votingStep,
    lastActiveStep,
    stepMessage,
    txHash,
    canPublishOnChain,
    onChainBlockedReason,
    preparedBallot,
    preparedReceipt,
    changePreparedVote,
    prepareVote,
    sendPreparedVote,
    discardPreparedVote,
  } = useCrispServer(proposal?.e3Id);
  const personalVoteStatus = usePrivateVoteStatus(proposal?.e3Id, address);
  const { canVote, message: cannotVoteMessage, isTimingOnly: voteBlockIsTimingOnly } = useCanVote(proposalIdx);
  const snapshot = useSnapshotVotingPower(body, proposal?.parameters.snapshotBlock);
  const { balance, votingPower, delegatesTo } = useTokenVotes(address);

  const showProposalLoading = getShowProposalLoading(proposal, proposalFetchStatus);
  const nowMs = useProposalBoundaryClock(
    proposal ? Number(proposal.parameters.startDate) * 1000 : undefined,
    proposal ? Number(proposal.parameters.endDate) * 1000 : undefined
  );
  const { status: proposalStatus, quorumNotMet } = useProposalStatus(proposal!, totalVotingPower, e3Failed, nowMs);
  const presentation = proposal
    ? proposalPresentation({
        sppOverride: getSppStatusOverride(spp.proposal, spp.state, spp.vetoTally, spp.vetoStage),
        bodyStatus: proposalStatus,
        startMs: Number(proposal.parameters.startDate) * 1000,
        endMs: Number(proposal.parameters.endDate) * 1000,
        isTallied: proposal.isTallied,
        networkResultPublished: networkProgress.published,
        roundFailed: e3Failed,
        nowMs,
      })
    : undefined;
  const votingOpen = presentation?.votingOpen === true;
  // Keep the outgoing card and its facts available while the next card grows into place.
  const lastPreparedBallot = useRef<PreparedBallot | null>(null);
  const lastPreparedReceipt = useRef<PreparedVoteReceipt | null>(null);
  const [, finishOutgoingCard] = useState(0);
  const ballotPanel = useRef<HTMLDivElement>(null);
  const preparedPanel = useRef<HTMLDivElement>(null);
  const submittedPanel = useRef<HTMLDivElement>(null);
  const snapshotScope = useRef({ proposalIdx, account: address });
  if (
    snapshotScope.current.proposalIdx !== proposalIdx ||
    (snapshotScope.current.account !== address && !preparedBallot && !preparedReceipt)
  ) {
    lastPreparedBallot.current = null;
    lastPreparedReceipt.current = null;
  }
  snapshotScope.current = { proposalIdx, account: address };
  if (preparedBallot) lastPreparedBallot.current = preparedBallot;
  if (preparedReceipt) lastPreparedReceipt.current = preparedReceipt;
  const ballotStep = preparedBallot ? "prepared" : preparedReceipt ? "submitted" : "ballot";
  const previousBallotStep = useRef(ballotStep);
  useEffect(() => {
    const previous = previousBallotStep.current;
    previousBallotStep.current = ballotStep;
    if (previous === ballotStep || !votingOpen) return;
    const outgoing = previous === "prepared" ? preparedPanel : previous === "submitted" ? submittedPanel : ballotPanel;
    const incoming =
      ballotStep === "prepared" ? preparedPanel : ballotStep === "submitted" ? submittedPanel : ballotPanel;
    const timer = window.setTimeout(() => {
      const focused = document.activeElement;
      if (focused !== document.body && !outgoing.current?.contains(focused) && !focused?.closest?.(".morph-dialog"))
        return;
      const action = incoming.current?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled)");
      (action ?? incoming.current)?.focus({ preventScroll: true });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [ballotStep, votingOpen]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let changed = false;
      if (ballotStep !== "prepared" && lastPreparedBallot.current) {
        lastPreparedBallot.current = null;
        changed = true;
      }
      if (ballotStep !== "submitted" && lastPreparedReceipt.current) {
        lastPreparedReceipt.current = null;
        changed = true;
      }
      if (changed) finishOutgoingCard((value) => value + 1);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [ballotStep, proposalIdx]);

  const results = useMemo(() => {
    if (!proposal || !proposal.options || !proposal.tally) return undefined;

    return proposal.options.map((option, idx) => ({
      option,
      value: proposal.tally[idx]?.toString() ?? "0",
    }));
  }, [proposal]);

  const options = useMemo(() => {
    return proposal?.options ?? ["Yes", "No"];
  }, [proposal]);

  const onVote = async (optionIndex: number, weight: BallotWeight) => {
    if (!proposal) return { success: false as const, error: "Proposal unavailable." };
    return postVote(BigInt(optionIndex), proposal.e3Id, proposal.parameters.snapshotBlock, false, submitOnChain, {
      weight,
    });
  };

  const onMask = async (target?: Address) => {
    if (!proposal) return { success: false as const, error: "Proposal unavailable." };

    // Mask uses the next index after the last option
    return postVote(BigInt(options.length), proposal.e3Id, proposal.parameters.snapshotBlock, true, submitOnChain, {
      maskTarget: target,
    });
  };

  const onPrepare = async (optionIndex: number, weight: BallotWeight) => {
    if (!proposal) return { success: false as const, error: "Proposal unavailable." };

    return prepareVote(BigInt(optionIndex), proposal.parameters.snapshotBlock, weight);
  };

  // Without a voting escrow, wallet FOLD votes through the token's own delegation, so a balance
  // above the votes means that the holder has not delegated. With the escrow, delegation only
  // activates locks, and `UncountedFoldNotice` names each part of the FOLD that does not count.
  const hasUnrepresentedBalance = !!balance && balance > ZERO && votingPower !== undefined && votingPower < balance;
  const delegatingToSomeoneElse = !!delegatesTo && delegatesTo !== address && delegatesTo !== ADDRESS_ZERO;
  const delegatedToZero = !!delegatesTo && delegatesTo === ADDRESS_ZERO;

  // The actions to be executed on the DAO live on the SPP proposal; the body
  // sub-proposal only carries the internal reportProposalResult callback.
  const sppActions = [...(spp.proposal?.actions ?? [])];

  // Ballots and masks are gated differently. A ballot needs the connected wallet's own voting
  // power; a mask writes someone else's slot, and `publishInput` checks THAT slot's eligibility,
  // never the sender's. So a wallet with no power can still mask, as long as voting is open and
  // there is a wallet to send from.
  const ballotOpen = votingOpen && isCommitteeReady !== false;

  if (!proposal || showProposalLoading) {
    return (
      <section className="flex w-full min-w-0">
        <PleaseWaitSpinner />
      </section>
    );
  }

  return (
    <section className={embedded ? "w-full min-w-0" : "flex w-screen min-w-full max-w-full flex-col items-center"}>
      <div className={embedded ? "w-full" : "proposal-page"}>
        <ProposalDetailLayout
          breadcrumb={!embedded && <ProposalBreadcrumb identifier={`E3 · ${e3RoundNumber(proposal.e3Id)}`} />}
          header={
            !embedded && (
              <ProposalHeader
                proposal={proposal}
                isCommitteeReady={isCommitteeReady}
                totalVotingPower={totalVotingPower}
                e3Failed={e3Failed}
                presentation={presentation}
              />
            )
          }
          description={proposal.description || "No description was provided"}
          resources={proposal.resources}
          actions={sppActions}
          voting={
            <>
              {votingOpen && (
                <FluidHeight layoutKey={ballotStep}>
                  <div className="motion-tab-panels">
                    <MotionPanel active={ballotStep === "ballot"} direction="left">
                      <div
                        ref={ballotPanel}
                        tabIndex={-1}
                        aria-label="Ballot"
                        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                      >
                        <VoteCard
                          key={`${proposalIdx}-${address}`}
                          votingPower={
                            <VotingPower
                              votingPlugin={body}
                              snapshotTimepoint={proposal.parameters.snapshotBlock}
                              compact={true}
                            />
                          }
                          proposalTitle={proposal.title}
                          creditMode={proposal.parameters.creditMode}
                          e3Id={proposal.e3Id}
                          getVoteWeight={getVoteWeight}
                          eligibilityNotice={
                            <BallotEligibilityNotice
                              connected={!!address}
                              canVote={canVote}
                              votingPower={snapshot.votingPower}
                              failed={snapshot.isError}
                            />
                          }
                          notice={voteBlockIsTimingOnly ? cannotVoteMessage : undefined}
                          voteStartDate={Number(proposal.parameters.startDate)}
                          voteEndDate={Number(proposal.parameters.endDate)}
                          isCommitteeReady={isCommitteeReady}
                          options={options}
                          disabled={!ballotOpen}
                          voteDisabled={canVote !== true}
                          canMask={ballotOpen && !!address}
                          isLoading={isLoading}
                          onClickVote={onVote}
                          onClickMask={onMask}
                          onPrepareVote={onPrepare}
                          canPublishOnChain={canPublishOnChain}
                          onChainBlockedReason={onChainBlockedReason}
                          submitOnChain={submitOnChain}
                          onChangeSubmitOnChain={setSubmitOnChain}
                          proposalId={proposalIdx}
                          votingStep={votingStep}
                          lastActiveStep={lastActiveStep}
                          stepMessage={stepMessage}
                          txHash={txHash}
                        />
                      </div>
                    </MotionPanel>
                    <MotionPanel active={ballotStep === "prepared"} direction="right">
                      <div
                        ref={preparedPanel}
                        tabIndex={-1}
                        aria-label="Signed ballot ready"
                        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                      >
                        {lastPreparedBallot.current && (
                          <PreparedVoteCard
                            ballot={preparedBallot ?? lastPreparedBallot.current}
                            busy={isLoading}
                            error={error}
                            onSend={sendPreparedVote}
                            onDiscard={discardPreparedVote}
                          />
                        )}
                      </div>
                    </MotionPanel>
                    <MotionPanel active={ballotStep === "submitted"} direction="right">
                      <div
                        ref={submittedPanel}
                        tabIndex={-1}
                        aria-label="Vote submitted"
                        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                      >
                        {lastPreparedReceipt.current && (
                          <SubmittedVoteCard
                            receipt={preparedReceipt ?? lastPreparedReceipt.current}
                            walletAddress={address}
                            canChangeVote={votingOpen}
                            onChangeVote={changePreparedVote}
                            onSwitchWallet={openWallet}
                          />
                        )}
                      </div>
                    </MotionPanel>
                  </div>
                </FluidHeight>
              )}
              {PUB_ENABLE_LOCKING ? (
                <UncountedFoldNotice address={address} delegatesTo={delegatesTo} />
              ) : (
                <If all={[hasUnrepresentedBalance, delegatingToSomeoneElse || delegatedToZero]}>
                  <NoVotePowerWarning
                    delegatingToSomeoneElse={delegatingToSomeoneElse}
                    delegatesTo={delegatesTo}
                    delegatedToZero={delegatedToZero}
                    address={address}
                    canVote={!!canVote}
                  />
                </If>
              )}
              {error && !votingOpen && (
                <div className="border border-critical-200 bg-critical-100 px-4 py-3">
                  <p className="text-sm text-critical-600 [overflow-wrap:anywhere]">{error}</p>
                </div>
              )}
              {!votingOpen && (
                <>
                  <VoteResultCard
                    vetoStage={spp.vetoStage}
                    isSignalling={false}
                    proposalId={proposalIdx}
                    e3Id={proposal.e3Id}
                    results={results}
                    isTallied={proposal.isTallied}
                    networkResultPublished={networkProgress.published}
                    proposalStatus={proposalStatus}
                    quorumNotMet={quorumNotMet}
                    minParticipation={Number(proposal.parameters.minParticipation ?? 0n)}
                    snapshotBlock={proposal.parameters.snapshotBlock}
                    numOptions={proposal.numOptions}
                    creditMode={proposal.parameters.creditMode}
                    e3Failed={e3Failed}
                    e3FailureReason={e3FailureReason}
                    e3FailurePending={e3FailurePending}
                    voteStartMs={Number(proposal.parameters.startDate) * 1000}
                    voteEndMs={Number(proposal.parameters.endDate) * 1000}
                    foundationStageStarted={spp.proposal?.currentStage !== undefined && spp.proposal.currentStage >= 1}
                  />
                </>
              )}
              {e3Failed && <RefundCard proposalId={proposalIdx} e3Id={proposal.e3Id} />}
            </>
          }
          personalVote={
            nowMs >= Number(proposal.parameters.endDate) * 1000 ? (
              <ClosedVoteStatus status={personalVoteStatus} secret={true} onConnect={() => void openWallet()} />
            ) : undefined
          }
          networkProgress={<NetworkProgress progress={networkProgress} />}
          participation={<ParticipationCard proposal={proposal} />}
          activity={<ActivityCard e3Id={proposal.e3Id} />}
          stage={
            <VetoStageCard
              kind="private"
              proposalId={sppProposalId}
              proposal={spp.proposal}
              state={spp.state}
              vetoStage={spp.vetoStage}
              vetoTally={spp.vetoTally}
              stage0Failed={e3Failed || proposalStatus === ProposalStatus.REJECTED}
              awaitingTally={
                !proposal.isTallied &&
                !networkProgress.published &&
                Number(proposal.parameters.endDate) * 1000 <= Date.now()
              }
            />
          }
        />
      </div>
    </section>
  );
}

const NoVotePowerWarning = ({
  delegatingToSomeoneElse,
  delegatesTo,
  delegatedToZero,
  address,
  canVote,
}: {
  delegatingToSomeoneElse: boolean;
  delegatesTo: Address | undefined;
  delegatedToZero: boolean;
  address: Address | undefined;
  canVote: boolean;
}) => {
  return (
    <AlertCard
      description={
        <span className="text-sm">
          <If true={delegatingToSomeoneElse}>
            <Then>
              You are currently delegating your voting power to <AddressText bold={false}>{delegatesTo}</AddressText>.
              If you wish to participate by yourself in future proposals,
            </Then>
            <ElseIf true={delegatedToZero}>
              You have not self delegated your voting power to participate in the DAO. If you wish to participate in
              future proposals,
            </ElseIf>
          </If>
          &nbsp;
          <SelfDelegateLink />.
        </span>
      }
      message={
        delegatingToSomeoneElse
          ? "Your voting power is currently delegated"
          : // `canVote` true here means the voter CAN vote on this proposal (their snapshot power
            // is fine) but holds an unrepresented balance that will not count on future ones.
            canVote
            ? "You cannot vote on new proposals"
            : "You cannot vote"
      }
      variant="info"
    />
  );
};

function getShowProposalLoading(
  proposal: ReturnType<typeof useProposal>["proposal"],
  status: ReturnType<typeof useProposal>["status"]
) {
  if (!proposal && status.proposalLoading) return true;
  else if (status.metadataLoading && !status.metadataError) return true;
  else if (!proposal?.title && !status.metadataError) return true;

  return false;
}
