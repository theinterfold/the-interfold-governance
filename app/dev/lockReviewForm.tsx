import { useRef, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { ActionButton } from "@/components/input/actionButton";
import { LockForm } from "@/plugins/velocker/components/lockForm";
import { compactNumber } from "@/utils/numbers";

type Props = {
  account: Address;
  currentDelegate: Address;
  balance: number;
  locksAmount: number;
  onCreated: (lock: { amount: number; owner: Address }) => void | Promise<void>;
  onDelegate: (target: Address) => void | Promise<void>;
};

// These values belong only to the shareable review's local FOLD fixtures.
const REVIEW_DECIMALS = 18;
const REVIEW_MINIMUM = parseUnits("100", REVIEW_DECIMALS);
const REVIEW_COOLDOWN_DAYS = 30;

function reviewAmount(value: string): bigint | undefined {
  if (!/\d/.test(value)) return undefined;
  try {
    return parseUnits(value, REVIEW_DECIMALS);
  } catch {
    return undefined;
  }
}

function fixtureAmount(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) return 0n;
  return parseUnits(value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 18 }), REVIEW_DECIMALS);
}

const reviewLabel = (value: bigint) => `${compactNumber(formatUnits(value, REVIEW_DECIMALS))} FOLD`;
const settleLocalAction = () => new Promise<void>((resolve) => setTimeout(resolve, 240));

/** The production form, driven exclusively by local review callbacks and fixtures. */
export function LockReviewFormAction({ account, currentDelegate, balance, locksAmount, onCreated, onDelegate }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [delegationError, setDelegationError] = useState<string>();
  const balanceValue = fixtureAmount(balance);
  const lockedValue = fixtureAmount(locksAmount);
  const amount = reviewAmount(value);
  const belowMinimum = amount !== undefined && amount < REVIEW_MINIMUM;
  const aboveBalance = amount !== undefined && amount > balanceValue;
  const canLock = amount !== undefined && amount > 0n && !belowMinimum && !aboveBalance;

  return (
    <>
      <ActionButton
        ref={triggerRef}
        type="button"
        intent="create"
        affordance="lock"
        onClick={() => {
          setValue("");
          setError(undefined);
          setDelegationError(undefined);
          setSession((previous) => previous + 1);
          setOpen(true);
        }}
      >
        Lock FOLD
      </ActionButton>
      <LockForm
        key={`${account}-${session}`}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        value={value}
        onValueChange={(next) => {
          setError(undefined);
          setValue(next);
        }}
        balance={reviewLabel(balanceValue)}
        balanceValue={balanceValue}
        minimum={reviewLabel(REVIEW_MINIMUM)}
        cooldownDays={REVIEW_COOLDOWN_DAYS}
        belowMinimum={belowMinimum}
        aboveBalance={aboveBalance}
        canLock={canLock}
        canUseMax={balanceValue > 0n}
        onMax={() => {
          setError(undefined);
          setValue(formatUnits(balanceValue, REVIEW_DECIMALS));
        }}
        account={account}
        currentDelegate={currentDelegate}
        existingLockedAmount={reviewLabel(lockedValue)}
        existingLockedValue={lockedValue}
        hasExistingLocks={lockedValue > 0n}
        canDelegate={true}
        refreshKey={session}
        pending={false}
        error={error}
        delegationError={delegationError}
        onConfirm={async (owner) => {
          if (amount === undefined || !canLock) return false;
          setError(undefined);
          try {
            await settleLocalAction();
            // The review reducer debits the payer and only adds an owned lock for this account.
            await onCreated({ amount: Number(formatUnits(amount, REVIEW_DECIMALS)), owner });
            return true;
          } catch {
            setError("Could not update this local preview. Try again.");
            return false;
          }
        }}
        onDelegate={async (target) => {
          setDelegationError(undefined);
          try {
            await settleLocalAction();
            await onDelegate(target);
            return true;
          } catch {
            setDelegationError("Could not update delegation in this local preview. Try again.");
            return false;
          }
        }}
      />
    </>
  );
}
