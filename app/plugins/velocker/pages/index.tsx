import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { Button, InputText, Tag } from "@aragon/ods";
import { formatUnits, isAddress, isAddressEqual, parseUnits, type Address } from "viem";
import { MainSection } from "@/components/layout/main-section";
import { MissingContentView } from "@/components/MissingContentView";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { AddressText } from "@/components/text/address";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { ADDRESS_ZERO } from "@/utils/evm";
import { compactNumber } from "@/utils/numbers";
import { DelegateList } from "@/plugins/members/components/delegateList";
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
  const onChanged = () => {
    // Give the RPC a beat to index the new state before refetching.
    setTimeout(() => {
      locks.refetch();
      void refetchVotes();
    }, 1000 * 2);
  };
  const delegation = useVeDelegation(address, escrow.adapter, onChanged);
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
  const { balance, lockable, lockedByVesting, createLock, isLocking, error: lockError } = useCreateLock(onChanged);
  const {
    beginWithdrawal,
    withdraw,
    cancelWithdrawal,
    pendingTokenId,
    error: withdrawError,
  } = useVeWithdraw(escrow.lockNft, onChanged);

  const [amountInput, setAmountInput] = useState("");
  const [lockForInput, setLockForInput] = useState("");
  const [delegateTarget, setDelegateTarget] = useState("");
  const decimals = useTokenDecimals();

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
  // Checked against what may actually be LOCKED, not what is held: FOLD that has not vested sits
  // in the wallet and counts toward voting power, but the token refuses to transfer it, so
  // offering it here would only produce a revert the user cannot act on.
  const aboveBalance = amount !== undefined && lockable !== undefined && amount > lockable;
  // True only when vesting is the reason the cap is below the balance.
  const hasVestingFold = lockable !== undefined && balance !== undefined && lockable < balance;
  // An empty field means "lock for myself"; anything else must parse as an address before the
  // button unlocks, because a lock minted to a mistyped address cannot be recovered.
  const lockForTrimmed = lockForInput.trim();
  const lockForRecipient = lockForTrimmed === "" ? undefined : (lockForTrimmed as Address);
  const lockForInvalid = lockForRecipient !== undefined && !isAddress(lockForRecipient);
  const lockingForSelf =
    lockForRecipient !== undefined && address !== undefined && isAddressEqual(lockForRecipient, address);
  const canLock = amount !== undefined && amount > 0n && !belowMinimum && !aboveBalance && !lockForInvalid;

  const notActivated = !delegation.delegatesTo || delegation.delegatesTo === ADDRESS_ZERO;
  const delegatedToSelf =
    !!delegation.delegatesTo && !!address && delegation.delegatesTo.toLowerCase() === address.toLowerCase();
  const totalLockedByMe =
    locks.ownedLocks.reduce((acc, l) => acc + l.amount, 0n) + locks.queuedExits.reduce((acc, t) => acc + t.amount, 0n);
  const cooldownDays = escrow.cooldown === undefined ? undefined : Math.round(escrow.cooldown / DAY);
  // Read off the exit queue, so it can be unknown while the read is in flight (or if it fails).
  // Never fill the gap with a number: a made-up "30-day" is a promise the contract has not made.
  const cooldownText = cooldownDays === undefined ? "a cooldown" : `a ${cooldownDays}-day cooldown`;

  return (
    <MainSection narrow>
      <div className="page-head w-full">
        <div>
          <div className="kicker mb-3">Membership</div>
          <h1 className="display-title">Voting power</h1>
        </div>
      </div>

      <div className="form-intro">
        <p>Voting power comes from {PUB_TOKEN_SYMBOL} that is committed, not just held:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Lock {PUB_TOKEN_SYMBOL} to create a voting position only you can withdraw.</li>
          <li>
            Delegate your locked {PUB_TOKEN_SYMBOL} — to yourself or someone you trust — to activate its voting power.
          </li>
          <li>Bonded and vesting {PUB_TOKEN_SYMBOL} count automatically, no delegation needed.</li>
          <li>
            Unlock any time: start the withdrawal, wait out {cooldownText}, then claim your {PUB_TOKEN_SYMBOL}. Voting
            power stops as soon as the withdrawal starts.
          </li>
        </ul>
        <p className="mt-3 font-semibold">
          Each committed {PUB_TOKEN_SYMBOL} counts 1:1 toward voting power, whether locked, bonded, or vesting.
        </p>
        <p className="mt-1">
          Voting power determines your weight in governance and whether you meet the threshold to create a proposal.
        </p>
      </div>

      {!isConnected || !address ? (
        <MissingContentView>
          Connect your wallet (top right) to lock {PUB_TOKEN_SYMBOL} and gain voting power.
        </MissingContentView>
      ) : (
        <div className="flex flex-col gap-y-6">
          <Card>
            <Row label={`${PUB_TOKEN_SYMBOL} balance`} value={fmt(balance)} />
            {hasVestingFold && <Row label="Available to lock" value={fmt(lockable)} />}
            <Row label="Locked by you" value={fmt(totalLockedByMe)} />
            <Row label="Your total voting power" value={fmt(votingPower)} />
            {breakdown.available && (
              <div className="flex flex-col gap-y-1 border-l-2 border-neutral-100 pl-3">
                <Row label="Locked + delegated" value={fmt(breakdown.lockedAndDelegated)} />
                <Row label="Bonded" value={fmt(breakdown.bonded)} />
                <Row label="Vesting" value={fmt(breakdown.vesting)} />
              </div>
            )}
            <Row
              label="Proposal eligibility"
              value={
                !eligibilityKnown ? (
                  "—"
                ) : canPropose ? (
                  <span className="text-success-600">Eligible</span>
                ) : (
                  <span className="text-neutral-500">Not eligible</span>
                )
              }
            />
            <Row label="Minimum required" value={fmt(minProposalPower)} />
            <Row
              label="Lock delegation"
              value={
                notActivated ? (
                  "Not activated — locks carry no voting power yet"
                ) : delegatedToSelf ? (
                  "Yourself"
                ) : (
                  <AddressText bold={false}>{delegation.delegatesTo}</AddressText>
                )
              }
            />
          </Card>

          {notActivated && (
            <Card>
              <p className="text-base font-semibold text-neutral-800">Activate your lock voting power</p>
              <p className="text-sm text-neutral-500">
                Locked {PUB_TOKEN_SYMBOL} only counts once you delegate it. Delegate to yourself to vote with your own
                locks — done once, future locks activate automatically.
              </p>
              <span>
                <Button
                  size="md"
                  variant="primary"
                  isLoading={delegation.isConfirming}
                  onClick={() => delegation.delegateToSelf()}
                >
                  Delegate to myself
                </Button>
              </span>
            </Card>
          )}

          <Card>
            <p className="text-base font-semibold text-neutral-800">Lock {PUB_TOKEN_SYMBOL}</p>
            <p className="text-sm text-neutral-500">
              Transfers {PUB_TOKEN_SYMBOL} into the voting escrow. Unlocking later takes {cooldownText}.
            </p>
            <InputText
              placeholder={`Amount of ${PUB_TOKEN_SYMBOL}`}
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                // digits and at most one decimal point — a plain amount field, no steppers
                if (/^\d*\.?\d*$/.test(v)) setAmountInput(v);
              }}
            />
            <div className="flex items-center gap-x-2 text-sm text-neutral-500">
              <span>Available to lock: {fmt(lockable)}</span>
              <button
                type="button"
                className="font-semibold text-primary-400 disabled:text-neutral-300"
                disabled={lockable === undefined || decimals === undefined || lockable === 0n}
                onClick={() => {
                  if (lockable !== undefined && decimals !== undefined) setAmountInput(formatUnits(lockable, decimals));
                }}
              >
                Max
              </button>
            </div>
            {/* Shown whenever the cap is below the wallet balance. Without it the page offered a
                balance the token refuses to move, and the lock failed with a bare
                `InsufficientUnlockedBalance` selector that told the user nothing. */}
            {hasVestingFold && (
              <p className="text-sm text-neutral-500">
                You hold {fmt(balance)}, but {fmt(lockedByVesting)} has not vested yet and cannot be locked. Vesting{" "}
                {PUB_TOKEN_SYMBOL} already counts toward your voting power without being locked — locking is only how
                you add power from {PUB_TOKEN_SYMBOL} that has vested.
              </p>
            )}
            {belowMinimum && <p className="text-sm text-critical-600">The minimum lock is {fmt(escrow.minDeposit)}.</p>}
            {aboveBalance && (
              <p className="text-sm text-critical-600">
                {hasVestingFold
                  ? `Only ${fmt(lockable)} has vested and can be locked right now.`
                  : `You do not hold that much ${PUB_TOKEN_SYMBOL}.`}
              </p>
            )}
            <InputText
              placeholder="0x… recipient (optional)"
              value={lockForInput}
              onChange={(e) => setLockForInput(e.target.value)}
            />
            <p className="text-sm text-neutral-500">
              Leave empty to lock for yourself. With an address, your {PUB_TOKEN_SYMBOL} is locked and the lock belongs
              to them: they get the voting power, and only they can withdraw it once unlocked. You cannot take it back.
            </p>
            {lockForInvalid && <p className="text-sm text-critical-600">That is not a valid address.</p>}
            {lockingForSelf && (
              <p className="text-sm text-neutral-500">That is your own address — this locks for yourself.</p>
            )}
            {lockError && <p className="text-sm text-critical-600">{lockError}</p>}
            <span>
              <Button
                size="md"
                variant="primary"
                isLoading={isLocking}
                disabled={!canLock}
                onClick={() => {
                  if (amount === undefined) return;
                  // Clear the recipient on success only: a failed lock keeps the form as typed,
                  // but a completed one must not silently reuse the address on the next lock.
                  void createLock(amount, lockForRecipient).then((ok) => {
                    if (ok) setLockForInput("");
                  });
                }}
              >
                {lockForRecipient && !lockingForSelf ? "Approve and lock for them" : "Approve and lock"}
              </Button>
            </span>
          </Card>

          <Card>
            <p className="text-base font-semibold text-neutral-800">Delegate your locks to someone else</p>
            <p className="text-sm text-neutral-500">
              They vote with your locks&apos; power until you change it. Your {PUB_TOKEN_SYMBOL} stays yours — all your
              locks, current and future, follow one delegate.
            </p>
            <InputText
              placeholder="0x… delegate address"
              value={delegateTarget}
              onChange={(e) => setDelegateTarget(e.target.value)}
            />
            <span>
              <Button
                size="md"
                variant="secondary"
                isLoading={delegation.isConfirming}
                disabled={!isAddress(delegateTarget)}
                onClick={() => delegation.delegate(delegateTarget as Address)}
              >
                Delegate locks
              </Button>
            </span>
          </Card>

          <Card>
            <p className="text-base font-semibold text-neutral-800">Your locks</p>
            {withdrawError && <p className="text-sm text-critical-600">{withdrawError}</p>}
            {locks.isLoading ? (
              <PleaseWaitSpinner />
            ) : locks.ownedLocks.length === 0 && locks.queuedExits.length === 0 ? (
              <p className="text-sm text-neutral-500">No locks yet.</p>
            ) : (
              <div className="flex flex-col gap-y-3">
                {locks.ownedLocks.map((lock) => (
                  <LockRow key={lock.tokenId.toString()}>
                    <div className="flex items-center gap-x-3">
                      <span className="font-semibold text-neutral-800">{fmt(lock.amount)}</span>
                      <Tag
                        label={lock.delegated ? "Active" : "Not delegated"}
                        variant={lock.delegated ? "success" : "warning"}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="tertiary"
                      isLoading={pendingTokenId === lock.tokenId}
                      onClick={() => void beginWithdrawal(lock.tokenId)}
                    >
                      Begin withdrawal
                    </Button>
                  </LockRow>
                ))}
                {locks.queuedExits.map((ticket) => (
                  <LockRow key={ticket.tokenId.toString()}>
                    <div className="flex items-center gap-x-3">
                      <span className="font-semibold text-neutral-800">{fmt(ticket.amount)}</span>
                      <Tag
                        label={ticket.canExit ? "Withdrawable" : `In cooldown until ${formatDate(ticket.exitDate)}`}
                        variant={ticket.canExit ? "success" : "info"}
                      />
                    </div>
                    <div className="flex gap-x-2">
                      {ticket.canExit ? (
                        <Button
                          size="sm"
                          variant="primary"
                          isLoading={pendingTokenId === ticket.tokenId}
                          onClick={() => void withdraw(ticket.tokenId)}
                        >
                          Withdraw
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          isLoading={pendingTokenId === ticket.tokenId}
                          onClick={() => void cancelWithdrawal(ticket.tokenId)}
                        >
                          Cancel and re-lock
                        </Button>
                      )}
                    </div>
                  </LockRow>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <p className="text-base font-semibold text-neutral-800">Delegates</p>
            <p className="text-sm text-neutral-500">
              Addresses with active {PUB_TOKEN_SYMBOL} voting power. Delegate your locks to any of them.
            </p>
            <DelegateList />
          </Card>
        </div>
      )}
    </MainSection>
  );
}

function formatDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-4 xl:p-6">{children}</div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="font-semibold text-neutral-800">{value}</span>
    </div>
  );
}

function LockRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between rounded-lg border border-neutral-100 p-3">{children}</div>;
}
