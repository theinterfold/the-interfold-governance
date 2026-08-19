import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { Button, InputNumber, Tag } from "@aragon/ods";
import { formatUnits, parseUnits } from "viem";
import { MainSection } from "@/components/layout/main-section";
import { MissingContentView } from "@/components/MissingContentView";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { AddressText } from "@/components/text/address";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { ADDRESS_ZERO } from "@/utils/evm";
import { compactNumber } from "@/utils/numbers";
import { useVeEscrow } from "../hooks/useVeEscrow";
import { useVeLocks } from "../hooks/useVeLocks";
import { useCreateLock } from "../hooks/useCreateLock";
import { useVeDelegation } from "../hooks/useVeDelegation";
import { useVeWithdraw } from "../hooks/useVeWithdraw";

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
  const { balance, createLock, isLocking, error: lockError } = useCreateLock(onChanged);
  const {
    beginWithdrawal,
    withdraw,
    cancelWithdrawal,
    pendingTokenId,
    error: withdrawError,
  } = useVeWithdraw(escrow.lockNft, onChanged);

  const [amountInput, setAmountInput] = useState("");
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
  const aboveBalance = amount !== undefined && balance !== undefined && amount > balance;
  const canLock = amount !== undefined && amount > 0n && !belowMinimum && !aboveBalance;

  const notActivated = !delegation.delegatesTo || delegation.delegatesTo === ADDRESS_ZERO;
  const delegatedToSelf =
    !!delegation.delegatesTo && !!address && delegation.delegatesTo.toLowerCase() === address.toLowerCase();
  const totalLockedByMe =
    locks.ownedLocks.reduce((acc, l) => acc + l.amount, 0n) + locks.queuedExits.reduce((acc, t) => acc + t.amount, 0n);
  const cooldownDays = escrow.cooldown === undefined ? undefined : Math.round(escrow.cooldown / DAY);

  return (
    <MainSection narrow>
      <div className="page-head w-full">
        <div>
          <div className="kicker mb-3">Membership</div>
          <h1 className="display-title">Lock {PUB_TOKEN_SYMBOL}</h1>
        </div>
      </div>

      {!isConnected || !address ? (
        <MissingContentView>
          Connect your wallet (top right) to lock {PUB_TOKEN_SYMBOL} and gain voting power.
        </MissingContentView>
      ) : (
        <div className="flex flex-col gap-y-6">
          <Card>
            <Row label={`${PUB_TOKEN_SYMBOL} balance`} value={fmt(balance)} />
            <Row label="Locked by you" value={fmt(totalLockedByMe)} />
            <Row label="Your total voting power" value={fmt(votingPower)} />
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
              Locking transfers {PUB_TOKEN_SYMBOL} into the voting escrow and mints a lock position that carries voting
              power. Unlocking takes two steps: start the withdrawal (voting power stops immediately), then withdraw
              after the {cooldownDays ?? "—"}-day cooldown.
            </p>
            <InputNumber
              placeholder={`Amount of ${PUB_TOKEN_SYMBOL}`}
              min={0}
              value={amountInput}
              onChange={(v) => setAmountInput(v ?? "")}
            />
            {belowMinimum && <p className="text-sm text-critical-600">The minimum lock is {fmt(escrow.minDeposit)}.</p>}
            {aboveBalance && <p className="text-sm text-critical-600">You do not hold that much {PUB_TOKEN_SYMBOL}.</p>}
            {lockError && <p className="text-sm text-critical-600">{lockError}</p>}
            <span>
              <Button
                size="md"
                variant="primary"
                isLoading={isLocking}
                disabled={!canLock}
                onClick={() => amount !== undefined && void createLock(amount)}
              >
                Approve and lock
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
