import { useProposal } from "../hooks/useProposal";
import ProposalHeader from "../components/proposal/header";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { useProposalVoting } from "../hooks/useProposalVoting";
import { useProposalExecute } from "../hooks/useProposalExecute";
import { BodySection } from "@/components/proposal/proposalBodySection";
import { IBreakdownMajorityVotingResult, ProposalVoting } from "@/components/proposalVoting";
import type { ITransformedStage, IVote } from "@/utils/types";
import { ProposalStages } from "@/utils/types";
import { useProposalStatus } from "../hooks/useProposalVariantStatus";
import dayjs from "dayjs";
import { ProposalActions } from "@/components/proposalActions/proposalActions";
import { CardResources } from "@/components/proposal/cardResources";
import { VotingPower } from "../components/votingPower";
import { ParticipationCard } from "../components/participationCard";
import { Address, formatUnits } from "viem";
import { useToken } from "../hooks/useToken";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { ElseIf, If, Then } from "@/components/if";
import { AlertCard, ProposalStatus } from "@aragon/ods";
import { useAccount } from "wagmi";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { ADDRESS_ZERO } from "@/utils/evm";
import { AddressText } from "@/components/text/address";
import { SelfDelegateLink } from "@/components/text/selfDelegate";
import { useCanVote } from "../hooks/useCanVote";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useProposalVoteList } from "../hooks/useProposalVoteList";
import { useSppProposal } from "@/plugins/spp/hooks/useSppProposal";
import { VetoStageCard } from "@/plugins/spp/components/vetoStageCard";
import { MissingContentView } from "@/components/MissingContentView";

const ZERO = BigInt(0);
const ABSTAIN_VALUE = 1;
const VOTE_YES_VALUE = 2;
const VOTE_NO_VALUE = 3;

/** `index` is the SPP (staged process) proposal id; the TokenVoting sub-proposal id is resolved on-chain. */
export default function ProposalDetail({ index: sppProposalId }: { index: bigint }) {
  const spp = useSppProposal("public", sppProposalId);

  if (spp.subProposalFailed) {
    return (
      <MissingContentView>
        The voting sub-proposal could not be created on the TokenVoting plugin for this proposal.
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
  const { voteProposal, isConfirming: isConfirmingVote } = useProposalVoting(proposalIdx);
  const { proposal, status: proposalFetchStatus } = useProposal(proposalIdx, true, {
    metadataUri: spp.metadataUri,
    creator: spp.creator,
  });
  const canVote = useCanVote(proposalIdx);
  const votes = useProposalVoteList(proposalIdx, proposal);
  const { symbol: tokenSymbol } = useToken();
  const tokenDecimals = useTokenDecimals();
  // "—" until the on-chain read lands, rather than formatting against an assumed 18.
  const fmtVotes = (v: bigint) => (tokenDecimals === undefined ? "—" : formatUnits(v, tokenDecimals));
  const { balance, delegatesTo } = useTokenVotes(address);
  const { executeProposal, canExecute, isConfirming: isConfirmingExecution } = useProposalExecute(proposalIdx);
  const showProposalLoading = getShowProposalLoading(proposal, proposalFetchStatus);
  const proposalStatus = useProposalStatus(proposal!);

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

  let cta: IBreakdownMajorityVotingResult["cta"];
  if (proposal?.executed) {
    cta = {
      disabled: true,
      label: "Result submitted",
    };
  } else if (proposalStatus === ProposalStatus.ACCEPTED || proposalStatus === ProposalStatus.EXECUTABLE) {
    // Executing the sub-proposal reports the approval to the SPP and advances to the veto stage.
    cta = {
      disabled: !canExecute,
      isLoading: isConfirmingExecution,
      label: "Submit result & advance to veto stage",
      onClick: executeProposal,
    };
  } else if (proposalStatus === ProposalStatus.ACTIVE) {
    cta = {
      disabled: !canVote,
      isLoading: isConfirmingVote,
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
      status: proposalStatus!,
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
        ({ voter, voteOption: opt }) =>
          ({
            address: voter,
            variant: opt === ABSTAIN_VALUE ? "abstain" : opt === VOTE_YES_VALUE ? "yes" : "no",
          }) as IVote
      ),
    },
  ];

  const hasBalance = !!balance && balance > ZERO;
  const delegatingToSomeoneElse = !!delegatesTo && delegatesTo !== address && delegatesTo !== ADDRESS_ZERO;
  const delegatedToZero = !!delegatesTo && delegatesTo === ADDRESS_ZERO;

  if (!proposal || showProposalLoading) {
    return (
      <section className="justify-left items-left flex w-screen min-w-full max-w-full">
        <PleaseWaitSpinner />
      </section>
    );
  }

  return (
    <section className="flex w-screen min-w-full max-w-full flex-col items-center">
      <ProposalHeader proposalIdx={proposalIdx} proposal={proposal} />

      <div className="mx-auto w-full max-w-screen-xl px-4 py-6 md:px-16 md:pb-20 md:pt-10">
        <div className="flex w-full flex-col gap-x-12 gap-y-6 md:flex-row">
          <div className="flex flex-col gap-y-6 md:w-[63%] md:shrink-0">
            <BodySection body={proposal.description || "No description was provided"} />
            <If all={[hasBalance, delegatingToSomeoneElse || delegatedToZero]}>
              <NoVotePowerWarning
                delegatingToSomeoneElse={delegatingToSomeoneElse}
                delegatesTo={delegatesTo}
                delegatedToZero={delegatedToZero}
                address={address}
                canVote={!!canVote}
              />
            </If>
            <ProposalVoting
              stages={proposalStage}
              description="Public proposals advance to the foundation veto stage when the support ratio is above the threshold and the minimum participation is met."
            />
            {/* The actions to be executed on the DAO live on the SPP proposal; the body
                sub-proposal only carries the internal reportProposalResult callback. */}
            <ProposalActions actions={[...(spp.proposal?.actions ?? [])]} />
          </div>
          <div className="flex flex-col gap-y-6 md:w-[33%]">
            <VotingPower snapshotTimepoint={proposal.parameters.snapshotTimepoint} />
            <ParticipationCard proposal={proposal} />
            <VetoStageCard
              kind="public"
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
          : canVote
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
