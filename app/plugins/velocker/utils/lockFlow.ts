export type LockFlowPhase = "locking" | "delegating";
export type LockFlowResult = "complete" | "lock-failed" | "delegation-failed" | "paused";

/** Retry delegation without creating a second lock after a partial success. */
export async function runLockFlow({
  lockConfirmed,
  ownerIsAccount,
  needsDelegation,
  createLock,
  delegate,
  onLockConfirmed,
  onPhase,
  canContinue,
}: {
  lockConfirmed: boolean;
  ownerIsAccount: boolean;
  needsDelegation: boolean;
  createLock: () => Promise<boolean>;
  delegate: () => Promise<boolean>;
  onLockConfirmed: () => void;
  onPhase: (phase: LockFlowPhase) => void;
  canContinue: () => boolean;
}): Promise<LockFlowResult> {
  if (!canContinue()) return "paused";
  if (!lockConfirmed) {
    onPhase("locking");
    if (!(await createLock())) return "lock-failed";
    onLockConfirmed();
  }
  // Never prompt a different account after a wallet switch during the lock receipt.
  if (!canContinue()) return "paused";
  // A payer cannot choose delegation on behalf of another lock owner.
  if (ownerIsAccount && needsDelegation) {
    onPhase("delegating");
    if (!(await delegate())) return "delegation-failed";
  }
  return "complete";
}
