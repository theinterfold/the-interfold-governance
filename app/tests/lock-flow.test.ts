import { describe, expect, test } from "bun:test";
import { runLockFlow } from "../plugins/velocker/utils/lockFlow";

describe("Combined lock and delegation", () => {
  test("does not delegate while the lock is unconfirmed or after it fails", async () => {
    const calls: string[] = [];
    let resolveLock!: (success: boolean) => void;
    const receipt = new Promise<boolean>((resolve) => {
      resolveLock = resolve;
    });
    const running = runLockFlow({
      ownerIsAccount: true,
      lockConfirmed: false,
      needsDelegation: true,
      createLock: () => {
        calls.push("lock");
        return receipt;
      },
      delegate: async () => {
        calls.push("delegate");
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

  test("a failed delegation can be retried without locking or spending FOLD again", async () => {
    let lockConfirmed = false;
    let lockCount = 0;
    let delegationCount = 0;
    const run = () =>
      runLockFlow({
        ownerIsAccount: true,
        lockConfirmed,
        needsDelegation: true,
        createLock: async () => {
          lockCount++;
          return true;
        },
        delegate: async () => {
          delegationCount++;
          return delegationCount > 1;
        },
        onLockConfirmed: () => {
          lockConfirmed = true;
        },
        onPhase: () => {},
        canContinue: () => true,
      });
    expect(await run()).toBe("delegation-failed");
    expect(lockConfirmed).toBe(true);
    expect(await run()).toBe("complete");
    expect(lockCount).toBe(1);
    expect(delegationCount).toBe(2);
  });

  test("keeping the existing delegate needs no delegation transaction", async () => {
    let delegated = false;
    expect(
      await runLockFlow({
        ownerIsAccount: true,
        lockConfirmed: false,
        needsDelegation: false,
        createLock: async () => true,
        delegate: async () => {
          delegated = true;
          return true;
        },
        onLockConfirmed: () => {},
        onPhase: () => {},
        canContinue: () => true,
      })
    ).toBe("complete");
    expect(delegated).toBe(false);
  });

  test("switching wallets during confirmation prevents the next transaction", async () => {
    let sameAccount = true;
    let delegated = false;
    let confirmed = false;
    expect(
      await runLockFlow({
        ownerIsAccount: true,
        lockConfirmed: false,
        needsDelegation: true,
        createLock: async () => {
          sameAccount = false;
          return true;
        },
        delegate: async () => {
          delegated = true;
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
    expect(delegated).toBe(false);
  });

  test("locking for another owner never changes the payer's delegation", async () => {
    const calls: string[] = [];
    const result = await runLockFlow({
      lockConfirmed: false,
      ownerIsAccount: false,
      needsDelegation: true,
      createLock: async () => {
        calls.push("lock-for-recipient");
        return true;
      },
      delegate: async () => {
        calls.push("delegate-payer");
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
