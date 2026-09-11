import { expect, test, describe } from "bun:test";
import { isAddress, isAddressEqual } from "viem";

/**
 * Two guards on the velocker / CRISP voting path, both of which fail closed rather than throwing.
 *
 * 1. `lockingForSelf` (velocker/pages/index.tsx) must not call `isAddressEqual` on an unvalidated
 *    string: viem THROWS `InvalidAddressError` for a malformed operand instead of returning false.
 *    The value is computed during render, so an unguarded call unmounts the page the moment a user
 *    types "0x" — before the "not a valid address" message can appear.
 *
 * 2. `ensureCircuits` (crispVoting/utils/circuits.ts) must refuse a second preset while the first
 *    is still DOWNLOADING. `registeredPreset()` only reports a completed registration, so it is
 *    blind to an in-flight load and both callers would reach `setCircuits`.
 */

const CONNECTED = "0x8837e47c4Bb520ADE83AAB761C3B60679443af1B" as const;

/** Mirror of the guarded `lockingForSelf` derivation. */
function lockingForSelf(typed: string, connected?: `0x${string}`): boolean {
  const trimmed = typed.trim();
  const recipient = trimmed === "" ? undefined : (trimmed as `0x${string}`);
  const invalid = recipient !== undefined && !isAddress(recipient);
  return !invalid && recipient !== undefined && connected !== undefined && isAddressEqual(recipient, connected);
}

describe("lock-for recipient validation", () => {
  test("a half-typed address does not throw", () => {
    // Each of these throws InvalidAddressError if isAddressEqual is called unguarded.
    for (const partial of ["0x", "0x8837", "0x8837e47c4Bb520ADE83AAB761C3B60679443af", "nonsense"]) {
      expect(() => lockingForSelf(partial, CONNECTED)).not.toThrow();
      expect(lockingForSelf(partial, CONNECTED)).toBe(false);
    }
  });

  test("recognises the connected account regardless of checksum casing", () => {
    expect(lockingForSelf(CONNECTED, CONNECTED)).toBe(true);
    expect(lockingForSelf(CONNECTED.toLowerCase(), CONNECTED)).toBe(true);
  });

  test("a different valid address is not self", () => {
    expect(lockingForSelf("0x652a31c669f9AB37f6040f279139a75D04F2679e", CONNECTED)).toBe(false);
  });

  test("an empty field means lock for myself, not a comparison", () => {
    expect(lockingForSelf("", CONNECTED)).toBe(false);
    expect(lockingForSelf("   ", CONNECTED)).toBe(false);
  });

  test("no connected wallet never throws", () => {
    expect(() => lockingForSelf("0x", undefined)).not.toThrow();
    expect(lockingForSelf(CONNECTED, undefined)).toBe(false);
  });
});

type CircuitPreset = "insecure-512" | "secure-8192";

/** Mirror of `ensureCircuits`' concurrency control, with the dynamic import stubbed. */
function makeEnsureCircuits() {
  let registered: CircuitPreset | undefined;
  let loadingPreset: CircuitPreset | undefined;
  const pending: Partial<Record<CircuitPreset, Promise<void>>> = {};
  const registrations: CircuitPreset[] = [];

  const ensure = async (preset: CircuitPreset, load: () => Promise<void>): Promise<void> => {
    const active = registered;
    if (active === preset) return;
    if (active) throw new Error(`Circuits for ${active} are already loaded; this round needs ${preset}.`);
    if (loadingPreset && loadingPreset !== preset) {
      throw new Error(`Circuits for ${loadingPreset} are still loading; this round needs ${preset}.`);
    }

    if (!pending[preset]) {
      loadingPreset = preset;
      pending[preset] = (async () => {
        try {
          await load();
          registered = preset;
          registrations.push(preset);
        } catch (error) {
          pending[preset] = undefined;
          throw error;
        } finally {
          if (loadingPreset === preset) loadingPreset = undefined;
        }
      })();
    }
    await pending[preset];
  };

  return { ensure, registrations: () => registrations, registered: () => registered };
}

const defer = () => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("ensureCircuits preset concurrency", () => {
  /** The regression: without the in-flight guard BOTH loads register. */
  test("refuses a second preset while the first is still downloading", async () => {
    const { ensure, registrations, registered } = makeEnsureCircuits();
    const first = defer();

    const a = ensure("insecure-512", () => first.promise);
    const b = ensure("secure-8192", async () => {}).then(
      () => "resolved",
      (e: Error) => e.message
    );

    expect(await b).toContain("still loading");

    first.resolve();
    await a;

    expect(registrations()).toEqual(["insecure-512"]);
    expect(registered()).toBe("insecure-512");
  });

  test("two concurrent calls for the SAME preset share one load", async () => {
    const { ensure, registrations } = makeEnsureCircuits();
    let loads = 0;
    const load = async () => {
      loads += 1;
    };

    await Promise.all([ensure("secure-8192", load), ensure("secure-8192", load)]);

    expect(loads).toBe(1);
    expect(registrations()).toEqual(["secure-8192"]);
  });

  test("a failed load releases the claim so the next attempt can retry", async () => {
    const { ensure, registrations } = makeEnsureCircuits();

    await expect(
      ensure("secure-8192", async () => {
        throw new Error("network");
      })
    ).rejects.toThrow("network");

    // The marker must be clear, or every later preset would be refused forever.
    await ensure("insecure-512", async () => {});
    expect(registrations()).toEqual(["insecure-512"]);
  });

  test("refuses a different preset once one is registered", async () => {
    const { ensure } = makeEnsureCircuits();
    await ensure("insecure-512", async () => {});

    await expect(ensure("secure-8192", async () => {})).rejects.toThrow("already loaded");
  });

  test("the same preset twice is a no-op", async () => {
    const { ensure, registrations } = makeEnsureCircuits();
    await ensure("secure-8192", async () => {});
    await ensure("secure-8192", async () => {});
    expect(registrations()).toEqual(["secure-8192"]);
  });
});
