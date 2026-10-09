import { describe, expect, test } from "bun:test";
import { runLockFlow } from "../plugins/velocker/utils/lockFlow";

describe("Combined lock and activation", () => {
  test("does not activate while the lock is unconfirmed or after it fails", async () => {
    const calls: string[] = [];
    let resolveLock!: (success: boolean) => void;
    const receipt = new Promise<boolean>((resolve) => {
      resolveLock = resolve;
    });
    const running = runLockFlow({
      ownerIsAccount: true,
      lockConfirmed: false,
      needsActivation: true,
      createLock: () => {
        calls.push("lock");
        return receipt;
      },
      activate: async () => {
        calls.push("activate");
        return true;
      },
      onLockConfirmed: () => {
        calls.push("confirmed");
      },
      onPhase: () => {},
      canContinue: () => true,
    });
    expect(calls).toEqual(["lock"]);
    resolveLock(false);
    expect(await running).toBe("lock-failed");
    expect(calls).toEqual(["lock"]);
  });

  test("a failed activation can be retried without locking or spending FOLD again", async () => {
    let lockConfirmed = false;
    let lockCount = 0;
    let activationCount = 0;
    const run = () =>
      runLockFlow({
        ownerIsAccount: true,
        lockConfirmed,
        needsActivation: true,
        createLock: async () => {
          lockCount++;
          return true;
        },
        activate: async () => {
          activationCount++;
          return activationCount > 1;
        },
        onLockConfirmed: () => {
          lockConfirmed = true;
        },
        onPhase: () => {},
        canContinue: () => true,
      });
    expect(await run()).toBe("activation-failed");
    expect(lockConfirmed).toBe(true);
    expect(await run()).toBe("complete");
    expect(lockCount).toBe(1);
    expect(activationCount).toBe(2);
  });

  test("an account that already votes for itself needs no activation transaction", async () => {
    let activated = false;
    expect(
      await runLockFlow({
        ownerIsAccount: true,
        lockConfirmed: false,
        needsActivation: false,
        createLock: async () => true,
        activate: async () => {
          activated = true;
          return true;
        },
        onLockConfirmed: () => {},
        onPhase: () => {},
        canContinue: () => true,
      })
    ).toBe("complete");
    expect(activated).toBe(false);
  });

  test("switching wallets during confirmation prevents the next transaction", async () => {
    let sameAccount = true;
    let activated = false;
    let confirmed = false;
    expect(
      await runLockFlow({
        ownerIsAccount: true,
        lockConfirmed: false,
        needsActivation: true,
        createLock: async () => {
          sameAccount = false;
          return true;
        },
        activate: async () => {
          activated = true;
          return true;
        },
        onLockConfirmed: () => {
          confirmed = true;
        },
        onPhase: () => {},
        canContinue: () => sameAccount,
      })
    ).toBe("paused");
    expect(confirmed).toBe(true);
    expect(activated).toBe(false);
  });

  test("locking for another owner never activates voting power for the payer", async () => {
    const calls: string[] = [];
    const result = await runLockFlow({
      lockConfirmed: false,
      ownerIsAccount: false,
      needsActivation: true,
      createLock: async () => {
        calls.push("lock-for-recipient");
        return true;
      },
      activate: async () => {
        calls.push("activate-payer");
        return true;
      },
      onLockConfirmed: () => {},
      onPhase: () => {},
      canContinue: () => true,
    });
    expect(result).toBe("complete");
    expect(calls).toEqual(["lock-for-recipient"]);
  });
});
