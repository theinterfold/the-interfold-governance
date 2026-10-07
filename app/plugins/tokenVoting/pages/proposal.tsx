import { useEffect } from "react";
import { useWalletModal } from "@/hooks/useWalletModal";
import { ClosedVoteStatus } from "@/components/proposalVoting/closedVoteStatus";
import { publicVoteStatus } from "@/components/proposalVoting/voteStatus";
import { PUB_CHAIN } from "@/constants";
import { ProposalDetailLayout } from "@/components/proposal/proposalDetailLayout";
import { ProposalBreadcrumb } from "@/components/proposal/proposalReadingHeader";
import { shortProposalId } from "@/utils/proposalId";
import { useProposal } from "../hooks/useProposal";
import ProposalHeader from "../components/proposal/header";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { useProposalVoting } from "../hooks/useProposalVoting";
import { IBreakdownMajorityVotingResult, ProposalVoting } from "@/components/proposalVoting";
import type { ITransformedStage, IVote } from "@/utils/types";
import { ProposalStages } from "@/utils/types";
import { useProposalStatus } from "../hooks/useProposalVariantStatus";
import dayjs from "dayjs";
import { VotingPower } from "../components/votingPower";
import { ParticipationCard } from "../components/participationCard";
import { Address, formatUnits } from "viem";
import { useToken } from "../hooks/useToken";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { ElseIf, If, Then } from "@/components/if";
import { ProposalStatus } from "@aragon/ods";
import { useAccount, useReadContract } from "wagmi";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { ADDRESS_ZERO } from "@/utils/evm";
import { AddressText } from "@/components/text/address";
import { SelfDelegateLink } from "@/components/text/selfDelegate";
import { PowerWarning } from "@/plugins/velocker/components/powerWarning";
import { UncountedFoldNotice } from "@/plugins/velocker/components/uncountedFoldNotice";
import { useCanVote } from "../hooks/useCanVote";
import { useSnapshotVotingPower } from "@/hooks/useSnapshotVotingPower";
import { BallotEligibilityNotice } from "@/components/proposalVoting/ballotEligibility";
import { PUB_ENABLE_LOCKING, PUB_TOKEN_SYMBOL, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { VotingMode } from "../utils/types";
import { VotingDetails } from "@/components/proposalVoting/votingDetails";
import { decodeTxError } from "@/utils/tx-errors";
import { useProposalVoteList } from "../hooks/useProposalVoteList";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { getSppStatusOverride } from "@/plugins/spp/utils/status";
import { proposalPresentation } from "@/plugins/governance/utils/proposalPresentation";
import { useProposalBoundaryClock } from "@/plugins/governance/utils/useProposalBoundaryClock";
import { VetoStageCard } from "@/plugins/spp/components/vetoStageCard";
import { UnavailableProposalDetail } from "@/components/proposal/unavailableProposalDetail";
import { PublicVoteResultCard } from "../components/voteResultCard";
import { PublicVotes } from "@/components/proposalVoting/publicVotes";

const ZERO = BigInt(0);
const ABSTAIN_VALUE = 1;
const VOTE_YES_VALUE = 2;
const VOTE_NO_VALUE = 3;

/** `index` is the SPP (staged process) proposal id; the TokenVoting sub-proposal id is resolved on-chain. */
export default function ProposalDetail({
  index: sppProposalId,
  embedded = false,
}: {
  index: bigint;
  embedded?: boolean;
}) {
  const spp = useSppProposal("public", sppProposalId);

  if (spp.missing) {
    return (
      <UnavailableProposalDetail
        proposalId={sppProposalId}
        status="Not found"
        message="This public proposal does not exist on-chain."
        embedded={embedded}
      />
    );
  }
  if (spp.subProposalFailed) {
    return (
      <UnavailableProposalDetail
        proposalId={sppProposalId}
        status="Creation failed"
        message="The voting sub-proposal could not be created on the TokenVoting plugin."
        embedded={embedded}
      />
    );
  }
  if (spp.error) {
    return (
      <UnavailableProposalDetail
        proposalId={sppProposalId}
        status="Unavailable"
        message="Could not load this public proposal. Check your connection and try again."
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
  const { open: openWallet } = useWalletModal();
  const voteTransaction = useProposalVoting(proposalIdx);
  const { voteProposal } = voteTransaction;
  const {
    data: previousVote,
    isError: voteReadFailed,
    refetch: refetchVote,
  } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
    abi: TokenVotingAbi,
    functionName: "getVoteOption",
    args: [proposalIdx, address!],
    query: { enabled: !!address, refetchInterval: 15000 },
  });
  const submittedOption =
    previousVote === VOTE_YES_VALUE
      ? 0
      : previousVote === VOTE_NO_VALUE
        ? 1
        : previousVote === ABSTAIN_VALUE
          ? 2
          : undefined;
  const { proposal, status: proposalFetchStatus } = useProposal(proposalIdx, true, {
    metadataUri: spp.metadataUri,
    creator: spp.creator,
  });
  const canVote = useCanVote(proposalIdx);
  const snapshot = useSnapshotVotingPower(PUB_TOKEN_VOTING_PLUGIN_ADDRESS, proposal?.parameters.snapshotTimepoint);
  const eligibilityNotice = (
    <BallotEligibilityNotice
      connected={!!address}
      canVote={canVote}
      votingPower={snapshot.votingPower}
      failed={snapshot.isError}
    />
  );
  const votes = useProposalVoteList(
    proposalIdx,
    proposal,
    voteTransaction.isConfirmed ? voteTransaction.hash : undefined
  );
  const { symbol: tokenSymbol } = useToken();
  const tokenDecimals = useTokenDecimals();
  // "—" until the on-chain read lands, rather than formatting against an assumed 18.
  const fmtVotes = (v: bigint) => (tokenDecimals === undefined ? "—" : formatUnits(v, tokenDecimals));
  const { balance, delegatesTo } = useTokenVotes(address);
  const showProposalLoading = getShowProposalLoading(proposal, proposalFetchStatus);
  const nowMs = useProposalBoundaryClock(
    proposal ? Number(proposal.parameters.startDate) * 1000 : undefined,
    proposal ? Number(proposal.parameters.endDate) * 1000 : undefined
  );
  const { status: proposalStatus, quorumNotMet } = useProposalStatus(
    proposal!,
    nowMs,
    proposalFetchStatus.proposalReadAtMs
  );
  const presentation = proposal
    ? proposalPresentation({
        sppOverride: getSppStatusOverride(spp.proposal, spp.state, spp.vetoTally, spp.vetoStage),
        bodyStatus: proposalStatus,
        startMs: Number(proposal.parameters.startDate) * 1000,
        endMs: Number(proposal.parameters.endDate) * 1000,
        nowMs,
      })
    : undefined;

  const startDate = dayjs(Number(proposal?.parameters.startDate) * 1000).toString();
  const endDate = dayjs(Number(proposal?.parameters.endDate) * 1000).toString();
  const totalVotes = (proposal?.tally.yes || ZERO) + (proposal?.tally.no || ZERO) + (proposal?.tally.abstain || ZERO);

  const onVote = (voteOption: number | null) => {
    switch (voteOption) {
      case 1:
        return voteProposal(VOTE_YES_VALUE, true);
      case 2:
        return voteProposal(VOTE_NO_VALUE, true);
      case 3:
        return voteProposal(ABSTAIN_VALUE, true);
    }
  };

  const votingOpen = presentation?.votingOpen === true;
  useEffect(() => {
    if (address && (voteTransaction.isConfirmed || !votingOpen)) void refetchVote();
  }, [address, votingOpen, voteTransaction.isConfirmed, refetchVote]);
  // Once voting has closed, "Submit result & advance" lives on the result card (PublicVoteResultCard).
  let cta: IBreakdownMajorityVotingResult["cta"];
  if (votingOpen) {
    cta = {
      disabled: !canVote,
      isLoading: voteTransaction.status === "pending" || voteTransaction.isConfirming,
      label: "Vote",
      onClick: (option?: number) => (option ? onVote(option) : null),
    };
  }

  const proposalStage: ITransformedStage[] = [
    {
      id: "1",
      type: ProposalStages.TOKEN_VOTING,
      variant: "majorityVoting",
      title: "Token voting",
      status: votingOpen
        ? ProposalStatus.ACTIVE
        : nowMs < Number(proposal?.parameters.startDate ?? 0n) * 1000
          ? ProposalStatus.PENDING
          : proposalStatus!,
      disabled: false,
      proposalId: proposalIdx.toString(),
      providerId: "1",
      result: {
        cta,
        votingScores: [
          {
            option: "Yes",
            voteAmount: fmtVotes(proposal?.tally.yes || ZERO),
            votePercentage: Number(((proposal?.tally.yes || ZERO) * BigInt(10_000)) / (totalVotes || BigInt(1))) / 100,
            tokenSymbol: tokenSymbol || PUB_TOKEN_SYMBOL,
          },
          {
            option: "No",
            voteAmount: fmtVotes(proposal?.tally.no || ZERO),
            votePercentage: Number(((proposal?.tally.no || ZERO) * BigInt(10_000)) / (totalVotes || BigInt(1))) / 100,
            tokenSymbol: tokenSymbol || PUB_TOKEN_SYMBOL,
          },
          {
            option: "Abstain",
            voteAmount: fmtVotes(proposal?.tally.abstain || ZERO),
            votePercentage:
              Number(((proposal?.tally.abstain || ZERO) * BigInt(10_000)) / (totalVotes || BigInt(1))) / 100,
            tokenSymbol: tokenSymbol || PUB_TOKEN_SYMBOL,
          },
        ],
        proposalId: proposalIdx.toString(),
      },
      details: {
        censusTimestamp: Number(proposal?.parameters.snapshotTimepoint || 0) || 0,
        startDate,
        endDate,
        strategy: "Token voting",
        options: "Vote",
      },
      votes: votes.map(
        ({ voter, voteOption: opt, votingPower }) =>
          ({
            address: voter,
            variant: opt === ABSTAIN_VALUE ? "abstain" : opt === VOTE_YES_VALUE ? "yes" : "no",
            votingPower:
              votingPower === undefined || tokenDecimals === undefined
                ? undefined
                : formatUnits(votingPower, tokenDecimals),
          }) as IVote
      ),
    },
  ];

  const hasBalance = !!balance && balance > ZERO;
  const delegatingToSomeoneElse = !!delegatesTo && delegatesTo !== address && delegatesTo !== ADDRESS_ZERO;
  const delegatedToZero = !!delegatesTo && delegatesTo === ADDRESS_ZERO;

  if (!proposal || showProposalLoading) {
    return (
      <section className="flex w-full min-w-0">
        <PleaseWaitSpinner />
      </section>
    );
  }

  const showResults =
    !votingOpen &&
    (nowMs >= Number(proposal.parameters.startDate) * 1000 ||
      !!getSppStatusOverride(spp.proposal, spp.state, spp.vetoTally, spp.vetoStage));

  // With locking, FOLD that does not count is named per source; without it, only the delegation gap is.
  const delegationNotice = PUB_ENABLE_LOCKING ? (
    <UncountedFoldNotice address={address} delegatesTo={delegatesTo} />
  ) : (
    <If all={[hasBalance, delegatingToSomeoneElse || delegatedToZero]}>
      <NoVotePowerWarning
        delegatingToSomeoneElse={delegatingToSomeoneElse}
        delegatesTo={delegatesTo}
        delegatedToZero={delegatedToZero}
        canVote={!!canVote}
      />
    </If>
  );

  return (
    <section className={embedded ? "w-full min-w-0" : "flex w-screen min-w-full max-w-full flex-col items-center"}>
      <div className={embedded ? "w-full" : "proposal-page"}>
        <ProposalDetailLayout
          breadcrumb={!embedded && <ProposalBreadcrumb identifier={shortProposalId(proposalIdx)} />}
          header={!embedded && <ProposalHeader proposal={proposal} presentation={presentation} />}
          description={proposal.description || "No description was provided"}
          resources={proposal.resources}
          // The actions to be executed on the DAO live on the SPP proposal; the body
          // sub-proposal only carries the internal reportProposalResult callback.
          actions={[...(spp.proposal?.actions ?? [])]}
          voting={
            <>
              {showResults ? (
                <PublicVoteResultCard
                  proposal={proposal}
                  proposalId={proposalIdx}
                  status={proposalStatus}
                  quorumNotMet={quorumNotMet}
                  vetoStage={spp.vetoStage}
                />
              ) : (
                <ProposalVoting
                  key={`${proposalIdx}:${address}`}
                  stage={proposalStage[0]}
                  proposalTitle={proposal.title}
                  votingPower={
                    <VotingPower
                      votingPlugin={PUB_TOKEN_VOTING_PLUGIN_ADDRESS}
                      snapshotTimepoint={proposal.parameters.snapshotTimepoint}
                      compact={true}
                    />
                  }
                  submittedOption={submittedOption}
                  canVote={canVote === true && votingOpen}
                  eligibilityNotice={eligibilityNotice}
                  canChangeVote={
                    votingOpen && proposal.parameters.votingMode === VotingMode.VoteReplacement && !!canVote
                  }
                  confirmed={voteTransaction.status === "success" && voteTransaction.isConfirmed}
                  error={
                    voteTransaction.error
                      ? decodeTxError(voteTransaction.error, "Could not submit the vote").description
                      : undefined
                  }
                  txHash={voteTransaction.isConfirmed ? voteTransaction.hash : undefined}
                />
              )}
              {delegationNotice}
            </>
          }
          personalVote={
            showResults ? (
              <ClosedVoteStatus
                status={publicVoteStatus(!!address, previousVote, voteReadFailed)}
                choice={submittedOption === undefined ? undefined : ["Yes", "No", "Abstain"][submittedOption]}
                onConnect={() => void openWallet()}
              />
            ) : undefined
          }
          activity={<PublicVotes votes={proposalStage[0].votes ?? []} />}
          methodDetails={
            <VotingDetails
              startDate={startDate}
              endDate={endDate}
              snapshotTakenAt={dayjs(Number(proposal.parameters.snapshotTimepoint) * 1000).toString()}
              options={"Yes, No, Abstain"}
              strategy="Transparent fallback"
            />
          }
          participation={<ParticipationCard proposal={proposal} />}
          stage={
            <VetoStageCard
              kind="public"
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

const NoVotePowerWarning = ({
  delegatingToSomeoneElse,
  delegatesTo,
  delegatedToZero,
  canVote,
}: {
  delegatingToSomeoneElse: boolean;
  delegatesTo: Address | undefined;
  delegatedToZero: boolean;
  canVote: boolean;
}) => {
  return (
    <PowerWarning
      title={
        delegatingToSomeoneElse
          ? "Your voting power is currently delegated"
          : canVote
            ? "You cannot vote on new proposals"
            : "You cannot vote"
      }
    >
      <If true={delegatingToSomeoneElse}>
        <Then>
          You are currently delegating your voting power to <AddressText bold={false}>{delegatesTo}</AddressText>. If
          you wish to participate by yourself in future proposals,
        </Then>
        <ElseIf true={delegatedToZero}>
          You have not self delegated your voting power to participate in the DAO. If you wish to participate in future
          proposals,
        </ElseIf>
      </If>
      &nbsp;
      <SelfDelegateLink />.
    </PowerWarning>
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
