import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { useWalletModal } from "@/hooks/useWalletModal";
import { PageIntro } from "@/components/pageIntro";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { PanelHeader } from "@/components/panelHeader";
import { AddressText } from "@/components/text/address";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useMemberName } from "@/hooks/useMemberName";
import { BondedDelegationCards } from "@/components/cards/BondedDelegationCards";
import { useBondedDelegation } from "@/hooks/useBondedDelegation";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { ADDRESS_ZERO } from "@/utils/evm";
import { compactNumber, displayNumber } from "@/utils/numbers";
import { VotingPowerInfo } from "../components/votingPowerInfo";
import { AccountOverview } from "../components/accountOverview";
import accountStyles from "../components/accountPanels.module.css";
import { PowerInfo } from "../components/powerInfo";
import { YourLocks } from "../components/yourLocks";
import { foldAllocation } from "../utils/foldAllocation";
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

export default function Locker() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const accountHeading = (
    <PanelHeader id="account-heading" title="Your account" description="Your voting power and FOLD balance." />
  );
  const escrow = useVeEscrow();
  const locks = useVeLocks(address, escrow);
  const { votingPower, refetch: refetchVotes } = useTokenVotes(address);
  const onChanged = () => {
    setWithdrawalAction(undefined);
    // Give the RPC a beat to index the new state before refetching.
    setTimeout(() => {
      locks.refetch();
      void refetchVotes();
      void refetchBalance();
      void delegation.refetch();
    }, 1000 * 2);
  };
  const delegation = useVeDelegation(address, escrow.adapter, onChanged);
  const bonded = useBondedDelegation(address, onChanged);
  const breakdown = useVotingPowerBreakdown(address, votingPower, delegation.lockVotes, bonded);
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
    lockable,
    unvested,
    createLock,
    isLocking,
    error: lockError,
    refetchBalance,
  } = useCreateLock(onChanged);
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
  const lockAction = useRef<HTMLButtonElement>(null);
  const handledLockRequest = useRef(false);
  const decimals = useTokenDecimals();
  const { open: openWallet } = useWalletModal();
  const withdrawalTrigger = useRef<HTMLElement | null>(null);
  const [withdrawalAction, setWithdrawalAction] = useState<WithdrawalAction>();
  const [withdrawalSubmitting, setWithdrawalSubmitting] = useState(false);
  const [withdrawalAttempted, setWithdrawalAttempted] = useState(false);
  const previousAccount = useRef(address);
  useEffect(() => {
    const changedAccount = previousAccount.current && previousAccount.current.toLowerCase() !== address?.toLowerCase();
    if (!isConnected || !address || changedAccount) {
      setLockOpen(false);
      setWithdrawalAction(undefined);
      setWithdrawalAttempted(false);
      setAmountInput("");
    }
    previousAccount.current = address;
  }, [address, isConnected]);
  const busy = isLocking || delegation.isConfirming || pendingTokenId !== undefined || withdrawalSubmitting;
  const lockRequested = router.query.action === "lock";
  useEffect(() => {
    if (!lockRequested) {
      handledLockRequest.current = false;
      return;
    }
    if (handledLockRequest.current || !isConnected || !address || busy) return;
    handledLockRequest.current = true;
    lockTrigger.current = lockAction.current;
    setLockOpen(true);
    const query = { ...router.query };
    delete query.action;
    void router.replace({ pathname: router.pathname, query, hash: "/" }, undefined, { shallow: true, scroll: false });
  }, [lockRequested, isConnected, address, busy, router]);
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
  const fmt = (v?: bigint) =>
    v === undefined || decimals === undefined ? "-" : `${compactNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;

  const amount = (() => {
    if (decimals === undefined || !amountInput) return undefined;
    try {
      return parseUnits(amountInput, decimals);
    } catch {
      return undefined;
    }
  })();
  const belowMinimum = amount !== undefined && escrow.minDeposit !== undefined && amount < escrow.minDeposit;
  // Checked against what may actually be LOCKED, not what is held: FOLD that has not vested sits
  // in the wallet and counts toward voting power, but the token refuses to transfer it, so
  // offering it here would only produce a revert the user cannot act on.
  const aboveBalance = amount !== undefined && lockable !== undefined && amount > lockable;
  // True only when vesting is the reason the cap is below the balance.
  const hasVestingFold = lockable !== undefined && balance !== undefined && lockable < balance;
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
    walletBalance: balance,
    bonded: breakdown.available ? breakdown.ownBonded : undefined,
    vesting: unvested,
    ownedLocks: locksKnown ? locks.ownedLocks : undefined,
    queuedExits: locksKnown ? locks.queuedExits : undefined,
  });
  const committedByMe = locks.ownedLocks.reduce((acc, lock) => acc + lock.amount, 0n);

  const compact = (value?: bigint) =>
    value === undefined || decimals === undefined ? "-" : compactNumber(formatUnits(value, decimals));
  const delegationLabel = !delegationKnown ? (
    delegation.readError ? (
      "Unavailable"
    ) : (
      "Loading…"
    )
  ) : notActivated ? (
    "No delegate"
  ) : (
    <AddressText bold={false} label={delegateName}>
      {delegation.delegatesTo}
    </AddressText>
  );

  return (
    <div className="power-page" data-section-presentation="outside">
      <PageIntro
        title="Voting power"
        glyph="voting"
        titleId="power-page-title"
        description={
          <>
            Lock {PUB_TOKEN_SYMBOL} and delegate it to yourself to vote.
            <br />
            You keep ownership of your tokens and <span className="power-intro-withdrawals">control withdrawals.</span>
          </>
        }
      />
      <section className="power-block power-overview" aria-label="Your voting power">
        <div className={accountStyles.panels}>
          {!(isConnected && address) && (
            <div>
              {accountHeading}
              <ScrollFadeIn amount="some" className="power-card" aria-labelledby="account-heading">
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
                {accountHeading}
                <AccountOverview allocation={allocation} heading={null}>
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
                            <p>Your wallet balance does not count toward this minimum.</p>
                          </PowerInfo>
                        </div>
                      )}
                  </div>
                </AccountOverview>
              </div>
              <YourLocks
                description="Create locks, track their status and manage withdrawals."
                headingPlacement="outside"
                locks={locks}
                delegationLabel={delegationLabel}
                votingStatus={locksKnown && committedByMe > 0n && (!delegatedToSelf || delegation.readError || delegation.error) ? <>
                  <div className={accountStyles.lockVotingCopy}>
                    {delegation.readError ? <p className="power-feedback" role="alert">
                      Voting status could not be loaded. <button type="button" className="ui-text-action" onClick={() => void delegation.retryRead()}>Try again</button>
                    </p> : <>
                      <span className={accountStyles.delegationState} data-active={delegatedToSelf}>
                        {delegatedToSelf ? null
                          : !delegationKnown ? "Loading voting status…"
                          : notActivated ? "Activate your locks to vote with them."
                          : <>Votes through <AddressText bold={false} label={delegateName} withAddress={true}>{delegation.delegatesTo}</AddressText></>}
                        <PowerInfo label="About voting with your locks" compact={true}>
                          <p>Activate your locks once to vote with them yourself. New locks then use the same voting wallet automatically.</p>
                          <p>Only active locks count. Locks in cooldown or ready to withdraw do not. Changes apply to proposals created afterwards.</p>
                          <p>You keep ownership of your FOLD and control withdrawals.</p>
                        </PowerInfo>
                      </span>
                      {delegationKnown && !notActivated && !delegatedToSelf && <p className={accountStyles.delegationNote}>This wallet votes with your locks. Take back the voting power to vote yourself.</p>}
                    </>}
                    {delegation.error && <p className="power-feedback" role="alert">{delegation.error}</p>}
                  </div>
                  {!delegation.readError && delegationKnown && !delegatedToSelf && <PowerAction
                    size="compact" affordance="next" isLoading={delegation.isConfirming}
                    disabled={busy || !escrow.adapter} onClick={() => void delegation.delegateToSelf()}>
                    {notActivated ? "Activate voting power" : "Vote with my locks"}
                  </PowerAction>}
                </> : undefined}
                busy={busy}
                compact={compact}
                openWithdrawal={openWithdrawal}
                createAction={
                  <PowerAction
                    ref={lockAction}
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
      {isConnected && address && (
        <section className="power-block power-delegation-block" aria-label="Voting delegation">
          <BondedDelegationCards address={address} bonded={bonded} />
        </section>
      )}
      {isConnected && address && (
        <>
          <LockForm
            key={address}
            open={lockOpen}
            onClose={() => setLockOpen(false)}
            triggerRef={lockTrigger}
            value={amountInput}
            onValueChange={setAmountInput}
            balance={fmt(lockable)}
            balanceValue={lockable}
            vestingNote={
              hasVestingFold
                ? `You hold ${fmt(balance)}, but ${fmt(unvested)} has not vested yet and cannot be locked. Vesting ${PUB_TOKEN_SYMBOL} already counts toward your voting power without being locked. Locking is only how you add power from ${PUB_TOKEN_SYMBOL} that has vested.`
                : undefined
            }
            minimum={fmt(escrow.minDeposit)}
            cooldownSeconds={escrow.cooldown}
            account={address}
            currentDelegate={delegation.delegatesTo}
            existingLockedAmount={fmt(locksKnown ? committedByMe : undefined)}
            hasExistingLocks={!locksKnown || committedByMe > 0n}
            canActivate={!!escrow.adapter && locksKnown}
            onActivate={delegation.delegateToSelf}
            activationError={delegation.error}
            belowMinimum={belowMinimum}
            aboveBalance={aboveBalance}
            canLock={canLock}
            canUseMax={lockable !== undefined && decimals !== undefined && lockable > 0n}
            onMax={() => {
              if (lockable !== undefined && decimals !== undefined) setAmountInput(formatUnits(lockable, decimals));
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
                ? displayNumber(formatUnits(withdrawalAction.amount, decimals))
                : "-"
            }
            cooldownSeconds={escrow.cooldown}
            pending={withdrawalSubmitting || pendingTokenId !== undefined}
            error={withdrawalAttempted ? withdrawError : undefined}
            triggerRef={withdrawalTrigger}
            onClose={() => setWithdrawalAction(undefined)}
            onConfirm={(kind) => void confirmWithdrawal(kind)}
          />
        </>
      )}
    </div>
  );
}
