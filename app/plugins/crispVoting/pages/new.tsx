import { useWalletModal } from "@/hooks/useWalletModal";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { Else, ElseIf, If, Then } from "@/components/if";
import { MissingContentView } from "@/components/MissingContentView";
import { FeeCreditCard } from "../components/feeCreditCard";
import { type CanCreateProposal, useCanCreateProposal } from "../hooks/useCanCreateProposal";
import { useCreateProposal } from "../hooks/useCreateProposal";
import { useDelegate } from "@/hooks/useDelegate";
import { ProposalComposer } from "@/plugins/governance/components/proposalComposer";
import type { ProposalCreateProps } from "@/plugins/governance/hooks/useProposalDraft";

export default function Create({ draft, onKindChange }: ProposalCreateProps) {
  const { address: selfAddress, isConnected } = useAccount();
  const canCreateState = useCanCreateProposal();
  const proposal = useCreateProposal(draft);

  return (
    <ProposalComposer
      {...proposal}
      kind="private"
      onKindChange={onKindChange}
      canSubmit={isConnected && canCreateState.canCreate && !canCreateState.isLoading}
      creationRequirement={{
        minimum: canCreateState.minProposerVotingPower,
        votingPower: canCreateState.votes,
        loading: canCreateState.isLoading,
      }}
      fee={<FeeCreditCard disabled={proposal.isCreating} durationSeconds={proposal.durationSeconds} />}
      renderEditor={(editor) => (
        <CrispCreationEligibility selfAddress={selfAddress} state={canCreateState} isConnected={isConnected}>
          {editor}
        </CrispCreationEligibility>
      )}
    />
  );
}

export const CrispCreationEligibility = ({
  selfAddress,
  isConnected,
  state,
  children,
}: {
  selfAddress: Address | undefined;
  isConnected: boolean;
  state: CanCreateProposal;
  children: ReactNode;
}) => {
  const { open } = useWalletModal();
  // The central hook, not the token-targeted one: with the velocker enabled, delegation lives
  // on the escrow's IVotes adapter — and `delegate()` on the BondedVotes voting token REVERTS.
  const { delegateToSelf, isConfirming: isDelegating } = useDelegate(() => setTimeout(() => state.refetch(), 1000 * 2));

  return (
    <If true={!selfAddress || !isConnected}>
      <Then>
        {/* Not connected */}
        <MissingContentView callToAction="Connect wallet" onClick={() => open()}>
          Please connect your wallet to continue.
        </MissingContentView>
      </Then>
      <ElseIf true={state.isLoading}>
        {/* Reading on-chain voting power */}
        <MissingContentView>Checking your voting power…</MissingContentView>
      </ElseIf>
      <ElseIf true={state.needsDelegation}>
        {/* Holds tokens but hasn't delegated — self-delegation activates voting power */}
        <MissingContentView callToAction="Delegate to myself" isLoading={isDelegating} onClick={() => delegateToSelf()}>
          You hold voting tokens, but they aren&apos;t delegated yet — so your voting power reads as zero on-chain and
          you can&apos;t create a proposal. Delegate to yourself once to activate it. This is a one-time transaction.
        </MissingContentView>
      </ElseIf>
      <ElseIf true={state.hasNoTokens}>
        {/* No tokens at all */}
        <MissingContentView>
          You cannot create a proposal because your account holds no FOLD voting tokens.
        </MissingContentView>
      </ElseIf>
      <ElseIf true={!state.canCreate}>
        {/* Below threshold for another reason */}
        <MissingContentView>You don&apos;t have enough voting power to create a proposal.</MissingContentView>
      </ElseIf>
      <Else>{children}</Else>
    </If>
  );
};
