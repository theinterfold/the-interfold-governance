import { ProposalDetailLayout } from "@/components/proposal/proposalDetailLayout";
import { ProposalBreadcrumb } from "@/components/proposal/proposalReadingHeader";
import { e3RoundNumber } from "../utils/ballotDigest";
import { useProposal } from "../hooks/useProposal";
import { PUB_CHAIN, PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";
import ProposalHeader from "../components/proposal/header";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { useProposalStatus } from "../hooks/useProposalStatus";
import { ProposalStatus } from "@aragon/ods";
import { useAccount } from "wagmi";
import { useCanVote } from "../hooks/useCanVote";
import { useSnapshotVotingPower } from "@/hooks/useSnapshotVotingPower";
import { BallotEligibilityNotice } from "@/components/proposalVoting/ballotEligibility";
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
import { useBallotPreviewVariant } from "@/dev/useBallotPreviewVariant";

/** `index` is the SPP (staged process) proposal id; the CRISP sub-proposal id is resolved on-chain. */
export default function ProposalDetail({
  index: sppProposalId,
  embedded = false,
}: {
  index: bigint;
  embedded?: boolean;
}) {
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
  const ballotVariant = useBallotPreviewVariant();
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
    status: proposalFetchStatus,
  } = useProposal(proposalIdx, { metadataUri: spp.metadataUri, creator: spp.creator });
  const {
    isLoading,
    error,
    postVote,
    getRandomMaskTarget,
    votingStep,
    lastActiveStep,
    stepMessage,
    txHash,
    canPublishOnChain,
    onChainBlockedReason,
  } = useCrispServer(proposal?.e3Id);
  const canVote = useCanVote(proposalIdx);
  const snapshot = useSnapshotVotingPower(PUB_CRISP_VOTING_PLUGIN_ADDRESS, proposal?.parameters.snapshotBlock);
  const eligibilityNotice = (
    <BallotEligibilityNotice
      connected={!!address}
      canVote={canVote}
      votingPower={snapshot.votingPower}
      failed={snapshot.isError}
    />
  );

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

  const onVote = async (optionIndex: number) => {
    if (!proposal) return { success: false as const, error: "Proposal unavailable." };
    return postVote(BigInt(optionIndex), proposal.e3Id, proposal.parameters.snapshotBlock, false, submitOnChain);
  };

  const onMask = async (target?: string) => {
    if (!proposal) return { success: false as const, error: "Proposal unavailable." };
    // Mask uses the next index after the last option
    return postVote(
      BigInt(options.length),
      proposal.e3Id,
      proposal.parameters.snapshotBlock,
      true,
      submitOnChain,
      target
    );
  };

  // The actions to be executed on the DAO live on the SPP proposal; the body
  // sub-proposal only carries the internal reportProposalResult callback.
  const sppActions = [...(spp.proposal?.actions ?? [])];

  if (!proposal || showProposalLoading) {
    return (
      <section className="flex w-full min-w-0">
        <PleaseWaitSpinner />
      </section>
    );
  }

  return (
    <section className={embedded ? "w-full min-w-0" : "flex w-screen min-w-full max-w-full flex-col items-center"}>
      <div className={embedded ? "w-full" : "mx-auto w-full max-w-screen-xl px-4 py-6 md:px-16 md:pb-20 md:pt-10"}>
        <ProposalDetailLayout
          breadcrumb={!embedded && <ProposalBreadcrumb identifier={`E3 · ${e3RoundNumber(proposal.e3Id)}`} />}
          header={
            !embedded && (
              <ProposalHeader
                proposal={proposal}
                isCommitteeReady={isCommitteeReady}
                totalVotingPower={totalVotingPower}
                e3Failed={e3Failed}
              />
            )
          }
          description={proposal.description || "No description was provided"}
          resources={proposal.resources}
          actions={sppActions}
          voting={
            <>
              {/* Both voting methods share the same reading, ballot and supporting-data layout. */}
              {proposalStatus === ProposalStatus.ACTIVE && (
                <VoteCard
                  key={`${proposalIdx}-${address}`}
                  votingPower={
                    <VotingPower
                      votingPlugin={PUB_CRISP_VOTING_PLUGIN_ADDRESS}
                      snapshotTimepoint={proposal.parameters.snapshotBlock}
                      compact={true}
                    />
                  }
                  proposalTitle={proposal.title}
                  maskAsOption={ballotVariant === "option"}
                  getRandomMaskTarget={getRandomMaskTarget}
                  eligibilityNotice={eligibilityNotice}
                  canMask={!!address && canVote !== undefined}
                  voteStartDate={Number(proposal?.parameters.startDate)}
                  voteEndDate={Number(proposal?.parameters.endDate)}
                  isCommitteeReady={isCommitteeReady}
                  options={options}
                  disabled={
                    !address ||
                    isCommitteeReady === false ||
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
                  walletAddress={address}
                  voteDisabled={canVote !== true}
                />
              )}
              {error && proposalStatus !== ProposalStatus.ACTIVE && (
                <div className="border border-critical-200 bg-critical-100 px-4 py-3">
                  <p className="text-sm text-critical-600">{error}</p>
                </div>
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
            </>
          }
          votingPower={
            proposalStatus !== ProposalStatus.ACTIVE ? (
              <VotingPower
                votingPlugin={PUB_CRISP_VOTING_PLUGIN_ADDRESS}
                snapshotTimepoint={proposal.parameters.snapshotBlock}
                compact={true}
              />
            ) : undefined
          }
          showVotingDetails={!!spp.proposal && spp.proposal.currentStage >= 1}
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
              stage0Failed={proposalStatus === ProposalStatus.REJECTED}
            />
          }
        />
      </div>
    </section>
  );
}

function getShowProposalLoading(
  proposal: ReturnType<typeof useProposal>["proposal"],
  status: ReturnType<typeof useProposal>["status"]
) {
  if (!proposal && status.proposalLoading) return true;
  else if (status.metadataLoading && !status.metadataError) return true;
  else if (!proposal?.title && !status.metadataError) return true;

  return false;
}
