import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { useWalletModal } from "@/hooks/useWalletModal";
import { PageIntro } from "@/components/pageIntro";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { PanelHeader } from "@/components/panelHeader";
import { AddressText } from "@/components/text/address";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useMemberName } from "@/hooks/useMemberName";
import { DelegateDirectory } from "@/plugins/members/components/delegateDirectory";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { ADDRESS_ZERO } from "@/utils/evm";
import { compactNumber, exactNumber } from "@/utils/numbers";
import { DelegateDialog } from "../components/delegateDialog";
import { VotingPowerInfo } from "../components/votingPowerInfo";
import { AccountOverview } from "../components/accountOverview";
import accountStyles from "../components/accountPanels.module.css";
import { PowerInfo } from "../components/powerInfo";
import { YourLocks } from "../components/yourLocks";
import { foldAllocation } from "../utils/foldAllocation";
import { delegatedLockTokens } from "../utils/delegatedLockPower";
import { createDelegateConnection } from "../utils/delegateConnection";
import { PowerAction } from "../components/powerAction";
import { LockForm } from "../components/lockForm";
import { WithdrawalDialog, type WithdrawalAction } from "../components/withdrawalDialog";
import { useVeEscrow } from "../hooks/useVeEscrow";
import { useVeLocks } from "../hooks/useVeLocks";
import { useCreateLock } from "../hooks/useCreateLock";
import { useVeDelegation } from "../hooks/useVeDelegation";
import { useVeWithdraw } from "../hooks/useVeWithdraw";
import { useVotingPowerBreakdown } from "../hooks/useVotingPowerBreakdown";
import { useCanCreateProposal as useCanCreatePrivate } from "@/plugins/crispVoting/hooks/useCanCreateProposal";
import { useCanCreateProposal as useCanCreatePublic } from "@/plugins/tokenVoting/hooks/useCanCreateProposal";

const DAY = 86_400;

export type PowerSectionPresentation = "inline" | "outside" | "compact";

/** The main page uses external introductions; saved studies can override them. */
export default function Locker({
  sectionPresentation = "outside",
  showPageIntro = true,
}: {
  sectionPresentation?: PowerSectionPresentation;
  showPageIntro?: boolean;
} = {}) {
  const outsideHeadings = sectionPresentation === "outside";
  const showIntroductions = sectionPresentation === "inline" || outsideHeadings;
  const { address, isConnected } = useAccount();
  const accountHeading = (
    <PanelHeader
      id="account-heading"
      title="Your account"
      description={showIntroductions ? "Your voting power and FOLD balance." : undefined}
    />
  );
  const delegationHeading = (
    <PanelHeader
      id="power-delegation-heading"
      title={isConnected && address ? "Your delegation" : "Delegates"}
      description={
        showIntroductions
          ? isConnected && address
            ? "Vote with your locked FOLD or choose someone to vote for you."
            : "Explore delegates and choose who votes with your locked FOLD."
          : undefined
      }
    />
  );
  const escrow = useVeEscrow();
  const locks = useVeLocks(address, escrow);
  const { votingPower, refetch: refetchVotes } = useTokenVotes(address);
  const [delegateRefreshKey, setDelegateRefreshKey] = useState(0);
  const onChanged = () => {
    setWithdrawalAction(undefined);
    // Give the RPC a beat to index the new state before refetching.
    setTimeout(() => {
      locks.refetch();
      void refetchVotes();
      void refetchBalance();
      void delegation.refetch();
      setDelegateRefreshKey((key) => key + 1);
    }, 1000 * 2);
  };
  const delegation = useVeDelegation(address, escrow.adapter, () => {
    setDelegateDialogOpen(false);
    onChanged();
  });
  const breakdown = useVotingPowerBreakdown(address, votingPower, delegation.lockVotes);
  // Proposal eligibility mirrors the on-chain create gates (delegated votes vs
  // minProposerVotingPower); the shown minimum is the cheapest path across the
  // installed processes, same as the proposals page.
  const privateCreate = useCanCreatePrivate();
  const publicCreate = useCanCreatePublic();
  const eligibilityKnown = !privateCreate.isLoading && !publicCreate.isLoading;
  const canPropose = privateCreate.canCreate || publicCreate.canCreate;
  const minProposalPower = [privateCreate.minProposerVotingPower, publicCreate.minProposerVotingPower]
    .filter((v): v is bigint => v !== undefined)
    .reduce<bigint | undefined>((min, v) => (min === undefined || v < min ? v : min), undefined);
  const {
    balance,
    walletBalance,
    createLock,
    isLocking,
    error: lockError,
    refetchBalance,
  } = useCreateLock(onChanged, {
    vestingBalance: breakdown.available ? breakdown.vesting : 0n,
  });
  const {
    beginWithdrawal,
    withdraw,
    cancelWithdrawal,
    pendingTokenId,
    error: withdrawError,
  } = useVeWithdraw(escrow.lockNft, onChanged);

  const [amountInput, setAmountInput] = useState("");
  const [lockOpen, setLockOpen] = useState(false);
  const lockTrigger = useRef<HTMLElement | null>(null);
  const [delegateDialogOpen, setDelegateDialogOpen] = useState(false);
  const [delegateChoice, setDelegateChoice] = useState<Address>();
  const [delegateConnection, setDelegateConnection] = useState<ReturnType<typeof createDelegateConnection>>();
  const delegateTrigger = useRef<HTMLElement | null>(null);
  const decimals = useTokenDecimals();
  const { open: openWallet, isOpen: walletModalOpen } = useWalletModal();
  useEffect(() => {
    delegateConnection?.update({ connected: isConnected && !!address, modalOpen: walletModalOpen });
  }, [delegateConnection, isConnected, address, walletModalOpen]);
  useEffect(() => () => delegateConnection?.dispose(), [delegateConnection]);
  useEffect(() => {
    if (!isConnected) setDelegateDialogOpen(false);
  }, [isConnected]);
  const withdrawalTrigger = useRef<HTMLElement | null>(null);
  const [withdrawalAction, setWithdrawalAction] = useState<WithdrawalAction>();
  const [withdrawalSubmitting, setWithdrawalSubmitting] = useState(false);
  const [withdrawalAttempted, setWithdrawalAttempted] = useState(false);
  const busy = isLocking || delegation.isConfirming || pendingTokenId !== undefined || withdrawalSubmitting;
  const openWithdrawal = (action: WithdrawalAction, trigger: HTMLElement) => {
    withdrawalTrigger.current = trigger;
    setWithdrawalAttempted(false);
    setWithdrawalAction(action);
  };
  const confirmWithdrawal = async (kind: WithdrawalAction["kind"]) => {
    if (!withdrawalAction || busy) return;
    setWithdrawalAttempted(true);
    setWithdrawalSubmitting(true);
    try {
      if (kind === "start") await beginWithdrawal(withdrawalAction.tokenId);
      else if (kind === "cancel") await cancelWithdrawal(withdrawalAction.tokenId);
      else await withdraw(withdrawalAction.tokenId);
    } finally {
      setWithdrawalSubmitting(false);
    }
  };
  const selectDelegate = (target?: Address) => {
    if (delegateConnection) return;
    delegateTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!isConnected || !address) {
      const request = createDelegateConnection(
        target,
        (selected) => {
          setDelegateChoice(selected);
          setDelegateDialogOpen(true);
          setDelegateConnection(undefined);
        },
        () => setDelegateConnection(undefined)
      );
      setDelegateConnection(request);
      void openWallet().catch(() => request.cancel());
      return;
    }
    setDelegateChoice(target);
    setDelegateDialogOpen(true);
  };

  const fmt = (v?: bigint) =>
    v === undefined || decimals === undefined ? "—" : `${compactNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;

  const amount = (() => {
    if (decimals === undefined || !amountInput) return undefined;
    try {
      return parseUnits(amountInput, decimals);
    } catch {
      return undefined;
    }
  })();
  const belowMinimum = amount !== undefined && escrow.minDeposit !== undefined && amount < escrow.minDeposit;
  const aboveBalance = amount !== undefined && balance !== undefined && amount > balance;
  const canLock = amount !== undefined && amount > 0n && !belowMinimum && !aboveBalance;

  const delegationKnown = delegation.delegatesTo !== undefined;
  const notActivated = delegationKnown && delegation.delegatesTo === ADDRESS_ZERO;
  const delegatedToSelf =
    !!delegation.delegatesTo && !!address && delegation.delegatesTo.toLowerCase() === address.toLowerCase();
  const delegateName = useMemberName(delegatedToSelf ? undefined : delegation.delegatesTo);
  const locksKnown = !locks.isLoading && !locks.error;
  const allocation = foldAllocation({
    account: address,
    delegate: delegation.delegatesTo,
    walletBalance,
    bonded: breakdown.bonded,
    vesting: breakdown.vesting,
    ownedLocks: locksKnown ? locks.ownedLocks : undefined,
    queuedExits: locksKnown ? locks.queuedExits : undefined,
  });
  const committedByMe = locks.ownedLocks.reduce((acc, lock) => acc + lock.amount, 0n);
  const delegatedTokens = delegatedLockTokens(delegation.delegatesTo, locksKnown ? locks.ownedLocks : undefined);
  const needsActivation = notActivated && locksKnown && committedByMe > 0n;
  const cooldownDays = escrow.cooldown === undefined ? undefined : Math.round(escrow.cooldown / DAY);
  // Read off the exit queue, so it can be unknown while the read is in flight (or if it fails).
  // Never fill the gap with a number: a made-up "30-day" is a promise the contract has not made.

  const compact = (value?: bigint) =>
    value === undefined || decimals === undefined ? "—" : compactNumber(formatUnits(value, decimals));
  const delegationLabel = !delegationKnown ? (
    "Loading…"
  ) : notActivated ? (
    "No delegate"
  ) : (
    <AddressText bold={false} label={delegateName}>
      {delegation.delegatesTo}
    </AddressText>
  );

  return (
    <div className="power-page" data-section-presentation={sectionPresentation}>
      {showPageIntro && (
        <PageIntro
          title="Voting power"
          glyph="voting"
          titleId="power-page-title"
          description={
            <>
              Lock {PUB_TOKEN_SYMBOL} to vote yourself or choose a delegate.
              <br />
              You keep ownership of your tokens and{" "}
              <span className="power-intro-withdrawals">control withdrawals.</span>
            </>
          }
        />
      )}
      <section className="power-block power-overview" aria-label="Your voting power">
        <div className={accountStyles.panels}>
          {!(isConnected && address) && (
            <div>
              {outsideHeadings && accountHeading}
              <ScrollFadeIn amount="some" className="power-card" aria-labelledby="account-heading">
                {!outsideHeadings && accountHeading}
                <div className="power-connect">
                  <p className="ui-body">Your balances and locks will appear here.</p>
                  <PowerAction onClick={() => openWallet()}>Connect wallet</PowerAction>
                </div>
              </ScrollFadeIn>
            </div>
          )}
          {isConnected && address && (
            <>
              <div>
                {outsideHeadings && accountHeading}
                <AccountOverview allocation={allocation} heading={outsideHeadings ? null : accountHeading}>
                  <div className="power-total-summary">
                    <dl className="power-metric-total" aria-label="Your voting power">
                      <dt>
                        Your voting power
                        <VotingPowerInfo breakdown={breakdown} totalVotes={votingPower} />
                      </dt>
                      <dd>
                        {compact(votingPower)}
                        <span>FOLD</span>
                      </dd>
                    </dl>
                    {eligibilityKnown &&
                      !canPropose &&
                      minProposalPower !== undefined &&
                      votingPower !== undefined &&
                      votingPower < minProposalPower && (
                        <div className="power-proposal-notice">
                          <span>Not eligible to create proposals</span>
                          <PowerInfo label="About proposal creation eligibility" compact={true}>
                            <p>Creating a proposal requires at least {fmt(minProposalPower)} of voting power.</p>
                            <p>Your wallet balance and power delegated to others do not count toward this minimum.</p>
                          </PowerInfo>
                        </div>
                      )}
                  </div>
                </AccountOverview>
              </div>
              <YourLocks
                description={showIntroductions ? "Create locks, track their status and manage withdrawals." : undefined}
                headingPlacement={outsideHeadings ? "outside" : "inside"}
                locks={locks}
                delegationLabel={delegationLabel}
                busy={busy}
                compact={compact}
                openWithdrawal={openWithdrawal}
                createAction={
                  <PowerAction
                    intent="create"
                    size="compact"
                    affordance="lock"
                    aria-haspopup="dialog"
                    disabled={busy}
                    onClick={(event) => {
                      lockTrigger.current = event.currentTarget;
                      setLockOpen(true);
                    }}
                  >
                    Lock FOLD
                  </PowerAction>
                }
              />
            </>
          )}
        </div>
      </section>
      <section className="power-block power-delegation-block" aria-labelledby="power-delegation-heading">
        {outsideHeadings && delegationHeading}
        <ScrollFadeIn amount="some" className="power-card">
          {!outsideHeadings && delegationHeading}
          {isConnected && address && (
            <div className="power-delegation-summary">
              <div className="power-delegation-overview">
                <dl className="power-delegated-total">
                  <dt>
                    Delegated tokens
                    <PowerInfo label="About delegated tokens" compact={true}>
                      <p>
                        FOLD in your active locks delegated to the wallet shown here, including yourself. All your locks
                        share one voting delegate.
                      </p>
                      <p>
                        Locks in cooldown or ready to withdraw are excluded. You keep ownership and control withdrawals.
                      </p>
                    </PowerInfo>
                  </dt>
                  <dd>
                    {compact(delegatedTokens)} <span>{PUB_TOKEN_SYMBOL}</span>
                  </dd>
                </dl>
              </div>
              <div className="power-delegation-content">
                <dl className="power-delegation-identity">
                  <dt>Voting delegate</dt>
                  <dd className="power-current-delegate-name">
                    {delegationKnown && !notActivated ? (
                      <AddressText bold={false} label={delegateName} withAddress={true}>
                        {delegation.delegatesTo}
                      </AddressText>
                    ) : (
                      delegationLabel
                    )}
                  </dd>
                  <dd className="power-current-delegate-note">
                    {needsActivation
                      ? `${fmt(committedByMe)} is locked without voting power. You can choose a delegate at any time.`
                      : notActivated
                        ? "Your locks have no voting delegate. You can choose one at any time."
                        : delegatedToSelf
                          ? "You vote with your locked FOLD."
                          : "Votes with your locked FOLD. You keep ownership and control withdrawals."}
                  </dd>
                </dl>
                <div className="power-current-delegate-actions" role="group" aria-label="Manage delegation">
                  <PowerAction
                    size="compact"
                    affordance="next"
                    aria-haspopup="dialog"
                    disabled={!delegationKnown || busy}
                    onClick={() => selectDelegate()}
                  >
                    {notActivated ? "Choose delegate" : "Change delegate"}
                  </PowerAction>
                  {delegationKnown && !notActivated && (
                    <PowerAction
                      size="compact"
                      affordance="close"
                      aria-haspopup="dialog"
                      disabled={busy}
                      onClick={() => selectDelegate(ADDRESS_ZERO)}
                    >
                      Remove delegation
                    </PowerAction>
                  )}
                </div>
              </div>
            </div>
          )}
          <DelegateDirectory refreshKey={delegateRefreshKey} onSelect={selectDelegate} pending={!!delegateConnection} />
        </ScrollFadeIn>
      </section>
      {isConnected && address && (
        <>
          <LockForm
            key={address}
            open={lockOpen}
            onClose={() => setLockOpen(false)}
            triggerRef={lockTrigger}
            value={amountInput}
            onValueChange={setAmountInput}
            balance={fmt(balance)}
            balanceValue={balance}
            minimum={fmt(escrow.minDeposit)}
            cooldownDays={cooldownDays}
            account={address}
            currentDelegate={delegation.delegatesTo}
            existingLockedAmount={fmt(locksKnown ? committedByMe : undefined)}
            existingLockedValue={locksKnown ? committedByMe : undefined}
            hasExistingLocks={!locksKnown || committedByMe > 0n}
            canDelegate={!!escrow.adapter && locksKnown}
            refreshKey={delegateRefreshKey}
            onDelegate={delegation.delegate}
            delegationError={delegation.error}
            belowMinimum={belowMinimum}
            aboveBalance={aboveBalance}
            canLock={canLock}
            canUseMax={balance !== undefined && decimals !== undefined && balance > 0n}
            onMax={() => {
              if (balance !== undefined && decimals !== undefined) setAmountInput(formatUnits(balance, decimals));
            }}
            pending={busy}
            error={lockError}
            onConfirm={(owner) =>
              amount !== undefined && canLock ? createLock(amount, owner) : Promise.resolve(false)
            }
          />

          <WithdrawalDialog
            action={withdrawalAction}
            amount={
              withdrawalAction && decimals !== undefined
                ? exactNumber(formatUnits(withdrawalAction.amount, decimals))
                : "—"
            }
            cooldownDays={cooldownDays}
            pending={withdrawalSubmitting || pendingTokenId !== undefined}
            error={withdrawalAttempted ? withdrawError : undefined}
            triggerRef={withdrawalTrigger}
            onClose={() => setWithdrawalAction(undefined)}
            onConfirm={(kind) => void confirmWithdrawal(kind)}
          />
          <DelegateDialog
            open={delegateDialogOpen}
            selected={delegateChoice}
            account={address}
            currentDelegate={delegation.delegatesTo}
            lockedAmount={locksKnown ? committedByMe : undefined}
            pending={delegation.isConfirming}
            error={delegation.error}
            canDelegate={!!escrow.adapter}
            refreshKey={delegateRefreshKey}
            triggerRef={delegateTrigger}
            onSelect={setDelegateChoice}
            onClose={() => setDelegateDialogOpen(false)}
            onConfirm={(target) => delegation.delegate(target)}
          />
        </>
      )}
    </div>
  );
}
