import { useProposal } from "../hooks/useProposal";
import { PUB_CHAIN, PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";
import ProposalHeader from "../components/proposal/header";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { BodySection } from "@/components/proposal/proposalBodySection";
import { useProposalStatus } from "../hooks/useProposalStatus";
import { ProposalActions } from "@/components/proposalActions/proposalActions";
import { CardResources } from "@/components/proposal/cardResources";
import type { Address } from "viem";
import { ElseIf, If, Then } from "@/components/if";
import { AlertCard, ProposalStatus } from "@aragon/ods";
import { useAccount } from "wagmi";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { ADDRESS_ZERO } from "@/utils/evm";
import { AddressText } from "@/components/text/address";
import { SelfDelegateLink } from "@/components/text/selfDelegate";
import { useCanVote } from "../hooks/useCanVote";
import { VoteCard } from "../components/vote/voteCard";
import { useCrispServer } from "../hooks/useCrispServer";
import { VoteResultCard } from "../components/vote/voteResultCard";
import { RefundCard } from "../components/fee/refundCard";
import { useMemo, useState } from "react";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { VetoStageCard } from "@/plugins/spp/components/vetoStageCard";
import { MissingContentView } from "@/components/MissingContentView";
import { VotingPower } from "@/plugins/tokenVoting/components/votingPower";
import { ParticipationCard } from "../components/participationCard";
import { ActivityCard } from "../components/activityCard";
import { SettlementProgressCard } from "../components/settlementProgressCard";

const ZERO = BigInt(0);

/** `index` is the SPP (staged process) proposal id; the CRISP sub-proposal id is resolved on-chain. */
export default function ProposalDetail({ index: sppProposalId }: { index: bigint }) {
  const spp = useSppProposal("private", sppProposalId);

  if (spp.subProposalFailed) {
    return (
      <MissingContentView>
        The voting sub-proposal could not be created on the CRISP plugin for this proposal.
      </MissingContentView>
    );
  }
  if (spp.subProposalId === undefined) {
    return (
      <section className="justify-left items-left flex w-screen min-w-full max-w-full">
        <PleaseWaitSpinner />
      </section>
    );
  }

  return <ProposalDetailBody proposalIdx={spp.subProposalId} sppProposalId={sppProposalId} spp={spp} />;
}

function ProposalDetailBody({
  proposalIdx,
  sppProposalId,
  spp,
}: {
  proposalIdx: bigint;
  sppProposalId: bigint;
  spp: ReturnType<typeof useSppProposal>;
}) {
  const { address } = useAccount();
  // Mainnet offers no relayer route for now: ballots go on-chain from the voter's wallet,
  // and the toggle is hidden. Testnets keep the choice.
  const directOnly = PUB_CHAIN.id === 1;
  const [submitOnChainChoice, setSubmitOnChainChoice] = useState(false);
  const submitOnChain = directOnly ? true : submitOnChainChoice;
  const {
    proposal,
    isCommitteeReady,
    totalVotingPower,
    e3Failed,
    e3FailurePending,
    e3FailureReason,
    e3InputDeadline,
    status: proposalFetchStatus,
  } = useProposal(proposalIdx, { metadataUri: spp.metadataUri, creator: spp.creator });
  const {
    isLoading,
    error,
    postVote,
    votingStep,
    lastActiveStep,
    stepMessage,
    txHash,
    canPublishOnChain,
    onChainBlockedReason,
  } = useCrispServer(proposal?.e3Id);
  const { canVote, message: cannotVoteMessage, isTimingOnly: voteBlockIsTimingOnly } = useCanVote(proposalIdx);
  const { balance, votingPower, delegatesTo } = useTokenVotes(address);

  const showProposalLoading = getShowProposalLoading(proposal, proposalFetchStatus);
  const proposalStatus = useProposalStatus(proposal!, totalVotingPower, e3Failed);

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

  const onVote = (optionIndex: number) => {
    if (!proposal) {
      return;
    }

    postVote(BigInt(optionIndex), proposal.e3Id, proposal.parameters.snapshotBlock, false, submitOnChain);
  };

  const onMask = () => {
    if (!proposal) return;
    // Mask uses the next index after the last option
    postVote(BigInt(options.length), proposal.e3Id, proposal.parameters.snapshotBlock, true, submitOnChain);
  };

  // Warn only about power that is NOT already counted. With the velocker, `votingPower` comes from
  // the BondedVotes adapter and includes FOLD bonded as ciphernode collateral and escrow-locked
  // FOLD; comparing against a raw balance flagged holders whose power is fully represented.
  const hasUnrepresentedBalance = !!balance && balance > ZERO && votingPower !== undefined && votingPower < balance;
  const delegatingToSomeoneElse = !!delegatesTo && delegatesTo !== address && delegatesTo !== ADDRESS_ZERO;
  const delegatedToZero = !!delegatesTo && delegatesTo === ADDRESS_ZERO;

  // The actions to be executed on the DAO live on the SPP proposal; the body
  // sub-proposal only carries the internal reportProposalResult callback.
  const sppActions = [...(spp.proposal?.actions ?? [])];

  if (!proposal || showProposalLoading) {
    return (
      <section className="justify-left items-left flex w-screen min-w-full max-w-full">
        <PleaseWaitSpinner />
      </section>
    );
  }

  return (
    <section className="flex w-screen min-w-full max-w-full flex-col items-center">
      <ProposalHeader
        proposalIdx={proposalIdx}
        proposal={proposal}
        isCommitteeReady={isCommitteeReady}
        totalVotingPower={totalVotingPower}
        e3Failed={e3Failed}
      />

      <div className="mx-auto w-full max-w-screen-xl px-4 py-6 md:px-16 md:pb-20 md:pt-10">
        <div className="flex w-full flex-col gap-x-12 gap-y-6 md:flex-row">
          <div className="flex flex-col gap-y-6 md:w-[63%] md:shrink-0">
            <BodySection body={proposal.description || "No description was provided"} />
            <If all={[hasUnrepresentedBalance, delegatingToSomeoneElse || delegatedToZero]}>
              <NoVotePowerWarning
                delegatingToSomeoneElse={delegatingToSomeoneElse}
                delegatesTo={delegatesTo}
                delegatedToZero={delegatedToZero}
                address={address}
                canVote={!!canVote}
              />
            </If>
            {/* Voting lives in the main column, mirroring the public (TokenVoting) page layout. */}
            {proposalStatus === ProposalStatus.ACTIVE && (
              <VoteCard
                error={voteBlockIsTimingOnly ? undefined : cannotVoteMessage}
                notice={voteBlockIsTimingOnly ? cannotVoteMessage : undefined}
                voteStartDate={Number(proposal?.parameters.startDate)}
                voteEndDate={Number(proposal?.parameters.endDate)}
                isCommitteeReady={isCommitteeReady}
                options={options}
                disabled={
                  isCommitteeReady === false ||
                  canVote === false ||
                  proposalStatus !== ProposalStatus.ACTIVE ||
                  Number(proposal?.parameters.startDate) > Math.round(Date.now() / 1000)
                }
                isLoading={isLoading}
                onClickVote={onVote}
                canPublishOnChain={canPublishOnChain}
                onChainBlockedReason={onChainBlockedReason}
                submitOnChain={submitOnChain}
                onChangeSubmitOnChain={directOnly ? undefined : setSubmitOnChainChoice}
                onClickMask={onMask}
                proposalId={proposalIdx}
                votingStep={votingStep}
                lastActiveStep={lastActiveStep}
                stepMessage={stepMessage}
                txHash={txHash}
              />
            )}
            {error && (
              <div className="border border-critical-200 bg-critical-100 px-4 py-3">
                <p className="text-sm text-critical-600">{error}</p>
              </div>
            )}
            {proposalStatus !== ProposalStatus.ACTIVE && (
              <SettlementProgressCard
                // Derive from the clock, not the status. A round whose voting has closed but which
                // has no tally yet reads as PENDING — exactly the window this card explains — so
                // gating on the status hid it precisely when it was needed.
                votingClosed={Number(proposal.parameters.endDate) * 1000 < Date.now()}
                isTallied={proposal.isTallied}
                isDead={e3Failed || e3FailurePending}
                inputDeadline={e3InputDeadline}
              />
            )}
            {proposalStatus !== ProposalStatus.ACTIVE && (
              <VoteResultCard
                vetoStage={spp.vetoStage}
                isSignalling={false}
                proposalId={proposalIdx}
                results={results}
                isTallied={proposal.isTallied}
                proposalStatus={proposalStatus}
                minParticipation={Number(proposal.parameters.minParticipation ?? 0n)}
                snapshotBlock={proposal.parameters.snapshotBlock}
                numOptions={proposal.numOptions}
                creditMode={proposal.parameters.creditMode}
                e3Failed={e3Failed}
                e3FailureReason={e3FailureReason}
                e3FailurePending={e3FailurePending}
              />
            )}
            {e3Failed && <RefundCard proposalId={proposalIdx} e3Id={proposal.e3Id} />}
            <ProposalActions actions={sppActions} />
          </div>
          <div className="flex flex-col gap-y-6 md:w-[33%]">
            <VotingPower snapshotTimepoint={proposal.parameters.snapshotBlock} plugin={PUB_CRISP_VOTING_PLUGIN_ADDRESS} />
            <ParticipationCard proposal={proposal} />
            <ActivityCard e3Id={proposal.e3Id} />
            <VetoStageCard
              kind="private"
              proposalId={sppProposalId}
              proposal={spp.proposal}
              state={spp.state}
              vetoStage={spp.vetoStage}
              vetoTally={spp.vetoTally}
              stage0Failed={proposalStatus === ProposalStatus.REJECTED}
            />
            <CardResources resources={proposal.resources} title="Resources" />
          </div>
        </div>
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
