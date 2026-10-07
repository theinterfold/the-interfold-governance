import type { ReactNode } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { Else, ElseIf, If, Then } from "@/components/if";
import { MissingContentView } from "@/components/MissingContentView";
import { useWalletModal } from "@/hooks/useWalletModal";
import { useCreateProposal } from "../hooks/useCreateProposal";
import { useCanCreateProposal } from "../hooks/useCanCreateProposal";
import { ProposalComposer } from "@/plugins/governance/components/proposalComposer";
import type { ProposalCreateProps } from "@/plugins/governance/hooks/useProposalDraft";

export default function Create({ draft, onKindChange }: ProposalCreateProps) {
  const { address: selfAddress, isConnected } = useAccount();
  const { canCreate, isLoading, minProposerVotingPower, votes } = useCanCreateProposal();
  const proposal = useCreateProposal(draft);

  return (
    <ProposalComposer
      {...proposal}
      durationSeconds={proposal.stageDurationSeconds}
      kind="public"
      onKindChange={onKindChange}
      canSubmit={isConnected && canCreate && !isLoading}
      creationRequirement={{ minimum: minProposerVotingPower, votingPower: votes, loading: isLoading }}
      eligibilityNotice={
        <TokenCreationEligibility
          selfAddress={selfAddress}
          canCreate={isLoading ? undefined : canCreate}
          isConnected={isConnected}
        >
          {null}
        </TokenCreationEligibility>
      }
    />
  );
}

export const TokenCreationEligibility = ({
  selfAddress,
  isConnected,
  canCreate,
  children,
}: {
  selfAddress: Address | undefined;
  isConnected: boolean;
  canCreate: boolean | undefined;
  children: ReactNode;
}) => {
  const { open } = useWalletModal();
  return (
    <If true={!selfAddress || !isConnected}>
      <Then>
        {/* Not connected */}
        <MissingContentView callToAction="Connect wallet" onClick={() => open()}>
          Please connect your wallet to continue.
        </MissingContentView>
      </Then>
      <ElseIf true={canCreate === undefined}>
        <MissingContentView>Checking your voting power…</MissingContentView>
      </ElseIf>
      <ElseIf true={!canCreate}>
        {/* Not a member */}
        <MissingContentView>You don&apos;t have enough delegated voting power to create a proposal.</MissingContentView>
      </ElseIf>
      <Else>{children}</Else>
    </If>
  );
};
