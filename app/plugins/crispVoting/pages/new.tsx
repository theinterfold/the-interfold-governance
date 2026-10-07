import { useWalletModal } from "@/hooks/useWalletModal";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { Else, ElseIf, If, Then } from "@/components/if";
import { MissingContentView } from "@/components/MissingContentView";
import { AddressText } from "@/components/text/address";
import { FeeCreditCard } from "../components/feeCreditCard";
import { type CanCreateProposal, useCanCreateProposal } from "../hooks/useCanCreateProposal";
import { useCreateProposal } from "../hooks/useCreateProposal";
import { useDelegate } from "@/hooks/useDelegate";
import { ProposalComposer } from "@/plugins/governance/components/proposalComposer";
import type { ProposalCreateProps } from "@/plugins/governance/hooks/useProposalDraft";
import { unixTimestampToDate } from "../utils/formatProposalDate";

/** "5d", "1d 2h", "20m" — only the units that are non-zero, so short testnet windows stay legible. */
function formatWindow(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [d ? `${d}d` : "", h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean);
  return parts.length ? parts.join(" ") : `${seconds}s`;
}

export default function Create({ draft, onKindChange }: ProposalCreateProps) {
  const { address: selfAddress, isConnected } = useAccount();
  const canCreateState = useCanCreateProposal();
  const proposal = useCreateProposal(draft);
  const { durationSeconds, votingStartsAt, availabilityWindowSeconds, feeBalanceShortfall } = proposal;

  return (
    <ProposalComposer
      {...proposal}
      kind="private"
      onKindChange={onKindChange}
      canSubmit={isConnected && canCreateState.canCreate && !canCreateState.isLoading}
      submitDisabled={!!feeBalanceShortfall}
      creationRequirement={{
        minimum: canCreateState.minProposerVotingPower,
        votingPower: canCreateState.votes,
        loading: canCreateState.isLoading,
      }}
      fee={<FeeCreditCard disabled={proposal.isCreating} durationSeconds={durationSeconds} />}
      schedule={
        <>
          <p className="composer-help">
            A proposal first gives the ciphernode committee time to prepare its key. Voting starts at the scheduled time
            and remains open for the full stage-configured window. Avail finalization, computation, and decryption
            happen after voting closes. A passed proposal then moves to the foundation stage before execution.
          </p>
          {durationSeconds !== undefined && (
            <p className="composer-help">
              Voting{" "}
              {votingStartsAt === undefined
                ? "starts after committee setup"
                : `starts no earlier than ${unixTimestampToDate(votingStartsAt)}`}{" "}
              and runs for {formatWindow(durationSeconds)}. After ballots close,
              {availabilityWindowSeconds === undefined
                ? " a separate Avail finalization window begins."
                : ` ${formatWindow(availabilityWindowSeconds)} is reserved for Avail finalization.`}
            </p>
          )}
        </>
      }
      eligibilityNotice={
        <CrispCreationEligibility selfAddress={selfAddress} state={canCreateState} isConnected={isConnected}>
          {null}
        </CrispCreationEligibility>
      }
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
      <ElseIf true={!state.canCreate && !!state.bondedDelegate}>
        {/* The bonded voting power counts for a delegate, and delegation to self cannot bring it back. */}
        <MissingContentView>
          You do not have enough voting power to create a proposal. Your bonded voting power votes through{" "}
          <AddressText bold={false}>{state.bondedDelegate}</AddressText>. To use it yourself, stop the delegation on the
          Voting power page.
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
