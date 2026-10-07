export type LockFlowPhase = "locking" | "activating";
export type LockFlowResult = "complete" | "lock-failed" | "activation-failed" | "paused";

/** Retry activation without creating a second lock after a partial success. */
export async function runLockFlow({
  lockConfirmed,
  ownerIsAccount,
  needsActivation,
  createLock,
  activate,
  onLockConfirmed,
  onPhase,
  canContinue,
}: {
  lockConfirmed: boolean;
  ownerIsAccount: boolean;
  needsActivation: boolean;
  createLock: () => Promise<boolean>;
  activate: () => Promise<boolean>;
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
  // A payer cannot activate voting power on behalf of another lock owner.
  if (ownerIsAccount && needsActivation) {
    onPhase("activating");
    if (!(await activate())) return "activation-failed";
  }
  return "complete";
}
