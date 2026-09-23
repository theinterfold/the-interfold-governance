import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { useWalletModal } from "@/hooks/useWalletModal";
import { MissingContentView } from "@/components/MissingContentView";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { AddressText } from "@/components/text/address";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useMemberName } from "@/hooks/useMemberName";
import { DelegateList } from "@/plugins/members/components/delegateList";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { ADDRESS_ZERO } from "@/utils/evm";
import { compactNumber } from "@/utils/numbers";
import { DelegateDialog } from "../components/delegateDialog";
import { VotingPowerInfo } from "../components/votingPowerInfo";
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

export default function Locker() {
  const { address, isConnected } = useAccount();
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
  const { balance, createLock, isLocking, error: lockError } = useCreateLock(onChanged);
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
  const delegateTrigger = useRef<HTMLElement | null>(null);
  const decimals = useTokenDecimals();
  const { open: openWallet } = useWalletModal();
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
  const confirmWithdrawal = async () => {
    if (!withdrawalAction || busy) return;
    setWithdrawalAttempted(true);
    setWithdrawalSubmitting(true);
    try {
      if (withdrawalAction.kind === "start") await beginWithdrawal(withdrawalAction.tokenId);
      else if (withdrawalAction.kind === "cancel") await cancelWithdrawal(withdrawalAction.tokenId);
      else await withdraw(withdrawalAction.tokenId);
    } finally {
      setWithdrawalSubmitting(false);
    }
  };
  const selectDelegate = (target?: Address) => {
    delegateTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
  const committedByMe = locks.ownedLocks.reduce((acc, lock) => acc + lock.amount, 0n);
  const totalLockedByMe = committedByMe + locks.queuedExits.reduce((acc, ticket) => acc + ticket.amount, 0n);
  const needsActivation = notActivated && locksKnown && committedByMe > 0n;
  const cooldownDays = escrow.cooldown === undefined ? undefined : Math.round(escrow.cooldown / DAY);
  // Read off the exit queue, so it can be unknown while the read is in flight (or if it fails).
  // Never fill the gap with a number: a made-up "30-day" is a promise the contract has not made.
  const cooldownText = cooldownDays === undefined ? "a cooldown" : `a ${cooldownDays}-day cooldown`;

  const compact = (value?: bigint) =>
    value === undefined || decimals === undefined ? "—" : compactNumber(formatUnits(value, decimals));
  const delegationLabel = !delegationKnown
    ? "Loading…"
    : notActivated
      ? "Not activated"
      : delegatedToSelf
        ? "Yourself"
        : (delegateName ?? <AddressText bold={false}>{delegation.delegatesTo}</AddressText>);
  const lockCount = locks.ownedLocks.length + locks.queuedExits.length;

  return (
    <div className="power-page">
      <section className="power-block power-overview" aria-labelledby="power-page-title">
        <header className="power-dashboard-header">
          <div className="page-head power-page-head">
            <h1 id="power-page-title" className="display-title">
              Voting power
            </h1>
            <VotingPowerInfo cooldownText={cooldownText} />
          </div>
          {isConnected && address && (
            <PowerAction
              intent="create"
              size="lg"
              affordance="plus"
              aria-haspopup="dialog"
              disabled={busy}
              onClick={(event) => {
                lockTrigger.current = event.currentTarget;
                setLockOpen(true);
              }}
            >
              Lock FOLD
            </PowerAction>
          )}
        </header>
        {isConnected && address ? (
          <>
            <dl className="power-metrics" aria-label="Your voting power">
              <div className="power-metric-total">
                <dt>Total voting power</dt>
                <dd>
                  {compact(votingPower)}
                  <span>FOLD</span>
                </dd>
              </div>
              <div>
                <dt>Locks delegated to you</dt>
                <dd>{compact(breakdown.available ? breakdown.lockedAndDelegated : undefined)}</dd>
              </div>
              <div>
                <dt>Bonded</dt>
                <dd>{compact(breakdown.available ? breakdown.bonded : undefined)}</dd>
              </div>
              <div>
                <dt>Vesting</dt>
                <dd>{compact(breakdown.available ? breakdown.vesting : undefined)}</dd>
              </div>
            </dl>
            <div className="power-account-foot">
              <div className="power-eligibility" aria-label="Proposal eligibility">
                <div className="power-eligibility-heading">
                  <p>Creating proposals</p>
                  <span className={`badge ${eligibilityKnown && canPropose ? "active" : "pending"}`}>
                    {!eligibilityKnown ? "Loading…" : canPropose ? "Eligible" : "Not eligible"}
                  </span>
                </div>
                <p className="power-eligibility-requirement">Minimum {fmt(minProposalPower)} voting power</p>
              </div>
              <p className="power-wallet-balance">
                Available to lock <strong>{fmt(balance)}</strong>
              </p>
            </div>
          </>
        ) : (
          <div className="power-connect">
            <MissingContentView callToAction="Connect wallet" onClick={() => openWallet()}>
              Connect your wallet to view your voting power and manage your {PUB_TOKEN_SYMBOL}.
            </MissingContentView>
          </div>
        )}
      </section>
      {isConnected && address && (
        <>
          <section className="power-block power-delegation-block" aria-labelledby="power-delegation-heading">
            <h2 id="power-delegation-heading">Delegation</h2>
            <div className="power-delegation-identity">
              <p className="power-label">Current voting delegate</p>
              <p className="power-current-delegate-name">{delegationLabel}</p>
              {delegationKnown && !notActivated && !delegatedToSelf && (
                <code className="delegate-address">{delegation.delegatesTo}</code>
              )}
              <p className="power-current-delegate-note">
                {needsActivation
                  ? `${fmt(committedByMe)} is locked. Choose a delegate to activate its voting power.`
                  : notActivated
                    ? "Choose who votes with your locked FOLD."
                    : delegatedToSelf
                      ? "You vote with your locked FOLD."
                      : "Votes with your locked FOLD. You keep ownership and control withdrawals."}
              </p>
            </div>
            <div className="power-current-delegate-actions">
              <PowerAction
                size="md"
                affordance="next"
                aria-haspopup="dialog"
                disabled={!delegationKnown || busy}
                onClick={() => selectDelegate()}
              >
                {notActivated ? "Choose delegate" : "Change delegate"}
              </PowerAction>
              {delegationKnown && !notActivated && !delegatedToSelf && (
                <button
                  type="button"
                  className="power-remove-delegate"
                  disabled={busy}
                  onClick={() => selectDelegate(address)}
                >
                  Remove delegate
                </button>
              )}
            </div>
          </section>
          <section className="power-block power-positions" aria-labelledby="power-positions-heading">
            <div className="power-section-head">
              <div>
                <h2 id="power-positions-heading">Your locks</h2>
                <p className="power-section-meta">
                  {locks.isLoading
                    ? "Loading locks…"
                    : locks.error
                      ? "Locks unavailable"
                      : `${fmt(totalLockedByMe)} across ${lockCount} ${lockCount === 1 ? "lock" : "locks"}`}
                </p>
              </div>
            </div>
            {locks.isLoading ? (
              <PleaseWaitSpinner />
            ) : locks.error ? (
              <p className="power-feedback" role="alert">
                {locks.error}
              </p>
            ) : lockCount === 0 ? (
              <p className="power-empty">No locks yet. Use Lock FOLD to create your first lock.</p>
            ) : (
              <div className="power-position-list" role="table" aria-label="Your FOLD locks">
                <div className="power-position-head" role="row">
                  <span role="columnheader">Lock ID</span>
                  <span role="columnheader">Amount</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Voting delegate</span>
                  <span role="columnheader">Available to withdraw</span>
                  <span role="columnheader" className="power-position-action">
                    Action
                  </span>
                </div>
                {locks.ownedLocks.map((lock) => (
                  <div className="power-position-row" role="row" key={lock.tokenId.toString()}>
                    <div className="power-position-id" role="cell">
                      #{lock.tokenId.toString()}
                    </div>
                    <div className="power-position-amount" role="cell">
                      <span>{compact(lock.amount)}</span>{" "}
                      <span className="power-position-unit">{PUB_TOKEN_SYMBOL}</span>
                    </div>
                    <div className="power-position-status" role="cell">
                      <span className={`badge ${lock.delegated ? "active" : "foundation"}`}>
                        {lock.delegated ? "Active" : "Not delegated"}
                      </span>
                    </div>
                    <div className="power-position-delegate" role="cell">
                      <span className="power-position-mobile-label" aria-hidden="true">
                        Voting delegate
                      </span>
                      <span>{lock.delegated ? delegationLabel : "Not delegated"}</span>
                    </div>
                    <div className="power-position-date" role="cell">
                      No withdrawal started
                    </div>
                    <div className="power-position-action" role="cell">
                      <PowerAction
                        size="sm"
                        affordance="next"
                        aria-haspopup="dialog"
                        disabled={busy}
                        onClick={(event) =>
                          openWithdrawal(
                            { kind: "start", tokenId: lock.tokenId, amount: lock.amount },
                            event.currentTarget
                          )
                        }
                      >
                        Start withdrawal
                      </PowerAction>
                    </div>
                  </div>
                ))}
                {locks.queuedExits.map((ticket) => (
                  <div className="power-position-row" role="row" key={ticket.tokenId.toString()}>
                    <div className="power-position-id" role="cell">
                      #{ticket.tokenId.toString()}
                    </div>
                    <div className="power-position-amount" role="cell">
                      <span>{compact(ticket.amount)}</span>{" "}
                      <span className="power-position-unit">{PUB_TOKEN_SYMBOL}</span>
                    </div>
                    <div className="power-position-status" role="cell">
                      <span className={`badge ${ticket.canExit ? "power-ready" : "executable"}`}>
                        {ticket.canExit ? "Withdrawable" : "In cooldown"}
                      </span>
                    </div>
                    <div className="power-position-delegate" role="cell">
                      <span className="power-position-mobile-label" aria-hidden="true">
                        Voting delegate
                      </span>
                      <span className="power-position-inactive">No voting power</span>
                    </div>
                    <div className="power-position-date" role="cell">
                      {ticket.canExit ? (
                        "Available now"
                      ) : (
                        <time dateTime={new Date(ticket.exitDate * 1000).toISOString()}>
                          {formatDate(ticket.exitDate)}
                        </time>
                      )}
                    </div>
                    <div className="power-position-action" role="cell">
                      <PowerAction
                        size="sm"
                        affordance="next"
                        aria-haspopup="dialog"
                        disabled={busy}
                        onClick={(event) =>
                          openWithdrawal(
                            {
                              kind: ticket.canExit ? "withdraw" : "cancel",
                              tokenId: ticket.tokenId,
                              amount: ticket.amount,
                            },
                            event.currentTarget
                          )
                        }
                      >
                        {ticket.canExit ? `Withdraw ${PUB_TOKEN_SYMBOL}` : "Cancel withdrawal"}
                      </PowerAction>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="power-help power-positions-note">
              Withdrawals stop voting power immediately. Claim your {PUB_TOKEN_SYMBOL} after {cooldownText}.
            </p>
          </section>

          <LockForm
            key={address}
            open={lockOpen}
            onClose={() => setLockOpen(false)}
            triggerRef={lockTrigger}
            value={amountInput}
            onValueChange={setAmountInput}
            balance={fmt(balance)}
            minimum={fmt(escrow.minDeposit)}
            cooldownDays={cooldownDays}
            account={address}
            currentDelegate={delegation.delegatesTo}
            existingLockedAmount={fmt(locksKnown ? committedByMe : undefined)}
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
            amount={withdrawalAction && decimals !== undefined ? exactAmount(withdrawalAction.amount, decimals) : "—"}
            cooldownDays={cooldownDays}
            pending={withdrawalSubmitting || pendingTokenId !== undefined}
            error={withdrawalAttempted ? withdrawError : undefined}
            triggerRef={withdrawalTrigger}
            onClose={() => setWithdrawalAction(undefined)}
            onConfirm={() => void confirmWithdrawal()}
          />
          <DelegateDialog
            open={delegateDialogOpen}
            selected={delegateChoice}
            account={address}
            currentDelegate={delegation.delegatesTo}
            lockedAmount={fmt(locksKnown ? committedByMe : undefined)}
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
      <section className="power-block power-delegates" aria-labelledby="power-delegates-heading">
        <div className="power-section-head">
          <div>
            <h2 id="power-delegates-heading">Delegates</h2>
            <p className="power-section-meta">Highest voting power first</p>
          </div>
        </div>
        <DelegateList layout="table" refreshKey={delegateRefreshKey} onSelect={selectDelegate} />
      </section>
    </div>
  );
}

function formatDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function exactAmount(value: bigint, decimals: number) {
  const [whole, fraction] = formatUnits(value, decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
