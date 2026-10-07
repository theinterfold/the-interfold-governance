import type { ReactNode } from "react";
import { formatEther, type Address } from "viem";
import { useAccount } from "wagmi";
import { Else, ElseIf, If, Then } from "@/components/if";
import { MissingContentView } from "@/components/MissingContentView";
import { AddressText } from "@/components/text/address";
import { useWalletModal } from "@/hooks/useWalletModal";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { useCreateProposal } from "../hooks/useCreateProposal";
import { useCanCreateProposal, type CanCreateProposal } from "../hooks/useCanCreateProposal";
import { ProposalComposer } from "@/plugins/governance/components/proposalComposer";
import type { ProposalCreateProps } from "@/plugins/governance/hooks/useProposalDraft";

export default function Create({ draft, onKindChange }: ProposalCreateProps) {
  const { address: selfAddress, isConnected } = useAccount();
  const state = useCanCreateProposal();
  const proposal = useCreateProposal(draft);

  return (
    <ProposalComposer
      {...proposal}
      durationSeconds={proposal.stageDurationSeconds}
      kind="public"
      onKindChange={onKindChange}
      canSubmit={isConnected && state.canCreate && !state.isLoading}
      creationRequirement={{
        minimum: state.minProposerVotingPower,
        votingPower: state.votes,
        loading: state.isLoading,
      }}
      renderEditor={(editor) => (
        <TokenCreationEligibility selfAddress={selfAddress} isConnected={isConnected} state={state}>
          {editor}
        </TokenCreationEligibility>
      )}
    />
  );
}

/** Explains why an account cannot create a public proposal, or renders the editor when it can. */
export const TokenCreationEligibility = ({
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
  const { canCreate, needsDelegation, bondedDelegate, hasNoTokens, isLoading, minProposerVotingPower, votes } = state;
  const threshold =
    minProposerVotingPower === undefined ? undefined : `${formatEther(minProposerVotingPower)} ${PUB_TOKEN_SYMBOL}`;
  const current = votes === undefined ? undefined : `${formatEther(votes)} ${PUB_TOKEN_SYMBOL}`;

  return (
    <If true={!selfAddress || !isConnected}>
      <Then>
        {/* Not connected */}
        <MissingContentView callToAction="Connect wallet" onClick={() => open()}>
          Please connect your wallet to continue.
        </MissingContentView>
      </Then>
      <ElseIf true={isLoading}>
        {/* Still reading the on-chain gate — do not accuse anyone before we know. */}
        <MissingContentView>Checking whether your account can create proposals…</MissingContentView>
      </ElseIf>
      <ElseIf true={!canCreate && needsDelegation}>
        {/* Holds enough tokens, but never delegated: self-delegation fixes it. */}
        <MissingContentView>
          {`You hold enough ${PUB_TOKEN_SYMBOL} to create a proposal, but your voting power is not delegated. ` +
            `Proposal creation counts delegated voting power${threshold ? ` (${threshold} required)` : ""}, ` +
            `so delegate to yourself on the Voting power page and then return here.`}
        </MissingContentView>
      </ElseIf>
      <ElseIf true={!canCreate && hasNoTokens}>
        {/* No tokens at all. */}
        <MissingContentView>
          {`Creating a proposal requires${threshold ? ` ${threshold} of` : ""} delegated voting power, ` +
            `and this account holds no ${PUB_TOKEN_SYMBOL}.`}
        </MissingContentView>
      </ElseIf>
      <ElseIf true={!canCreate && !!bondedDelegate}>
        {/* The bonded voting power counts for a delegate, and delegation to self cannot bring it back. */}
        <MissingContentView>
          {`Creating a proposal requires${threshold ? ` ${threshold} of` : ""} delegated voting power` +
            `${current ? `, and this account has ${current}` : ""}. Your bonded voting power votes through `}
          <AddressText bold={false}>{bondedDelegate}</AddressText>. To use it yourself, stop the delegation on the
          Voting power page.
        </MissingContentView>
      </ElseIf>
      <ElseIf true={!canCreate}>
        {/* Below the threshold: say by how much rather than calling them "not a member". */}
        <MissingContentView>
          {`Creating a proposal requires${threshold ? ` ${threshold} of` : ""} delegated voting power` +
            `${current ? `, and this account has ${current}` : ""}. ` +
            `Voting power counts delegated votes, so check that your ${PUB_TOKEN_SYMBOL} is delegated.`}
        </MissingContentView>
      </ElseIf>
      <Else>{children}</Else>
    </If>
  );
};
