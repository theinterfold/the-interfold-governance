import { useState } from "react";
import { useAccount } from "wagmi";
import { CrispCreationEligibility } from "@/plugins/crispVoting/pages/new";
import { TokenCreationEligibility } from "@/plugins/tokenVoting/pages/new";
import { useCreateProposal as usePrivateProposal } from "@/plugins/crispVoting/hooks/useCreateProposal";
import { useCreateProposal as usePublicProposal } from "@/plugins/tokenVoting/hooks/useCreateProposal";
import { useCanCreateProposal as usePrivateEligibility } from "@/plugins/crispVoting/hooks/useCanCreateProposal";
import { useCanCreateProposal as usePublicEligibility } from "@/plugins/tokenVoting/hooks/useCanCreateProposal";
import { FeeCreditCard } from "@/plugins/crispVoting/components/feeCreditCard";
import { ProposalComposer } from "../components/proposalComposer";
import { useProposalDraft, type ProposalKind } from "../hooks/useProposalDraft";

export default function CreateProposal() {
  const [kind, setKind] = useState<ProposalKind>("private");
  const draft = useProposalDraft();
  const { address, isConnected } = useAccount();
  const privateProposal = usePrivateProposal(draft);
  const publicProposal = usePublicProposal(draft);
  const privateEligibility = usePrivateEligibility();
  const publicEligibility = usePublicEligibility();
  const proposal = kind === "private" ? privateProposal : publicProposal;
  const eligibility = kind === "private" ? privateEligibility : publicEligibility;
  const canSubmit = isConnected && eligibility.canCreate && !eligibility.isLoading;
  const durationSeconds = kind === "private" ? privateProposal.durationSeconds : publicProposal.stageDurationSeconds;

  // One mounted editor keeps cursor position, disclosure state and the draft intact.
  // Both hooks only prepare writes; submission calls the selected SPP path exclusively.
  return (
    <ProposalComposer
      {...proposal}
      kind={kind}
      onKindChange={setKind}
      canSubmit={canSubmit}
      creationRequirement={{
        minimum: eligibility.minProposerVotingPower,
        votingPower: eligibility.votes,
        loading: eligibility.isLoading,
      }}
      durationSeconds={durationSeconds}
      fee={
        kind === "private" ? (
          <FeeCreditCard disabled={proposal.isCreating} durationSeconds={durationSeconds} />
        ) : undefined
      }
      renderEditor={(editor) =>
        canSubmit ? (
          editor
        ) : kind === "private" ? (
          <CrispCreationEligibility selfAddress={address} isConnected={isConnected} state={privateEligibility}>
            {editor}
          </CrispCreationEligibility>
        ) : (
          <TokenCreationEligibility
            selfAddress={address}
            isConnected={isConnected}
            state={publicEligibility}
          >
            {editor}
          </TokenCreationEligibility>
        )
      }
    />
  );
}
