import type { Address, Hex } from "viem";

/** The part of `Storage` this module uses, so tests can pass a plain map. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/** `localStorage` shaped for the SDK stores (`stagingSecretStore`, `ciphertextStore`), which key their entries themselves. */
export const localStorageAdapter = (storage: KeyValueStorage) => ({
  get: (key: string) => storage.getItem(key),
  set: (key: string, value: string) => storage.setItem(key, value),
});

/** The embedded Aztec account of one wallet: keys for an initializerless Schnorr account (nothing is deployed). */
export type StoredAccount = { secret: Hex; salt: Hex; signingKey: Hex };

/** One Aztec account per connected wallet, so a voter keeps the same Aztec address across visits. */
export const aztecAccountStorageKey = (wallet: Address) => `interfold-governance:aztec-account:v1:${wallet.toLowerCase()}`;

const FIELD = /^0x[0-9a-fA-F]{1,64}$/;

/** A stored account, or `undefined` when the value is missing or damaged (a new account is then made). */
export const parseStoredAccount = (raw: string | null): StoredAccount | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAccount> | null;
    if (!parsed || !FIELD.test(parsed.secret ?? "") || !FIELD.test(parsed.salt ?? "") || !FIELD.test(parsed.signingKey ?? "")) {
      return undefined;
    }
    return { secret: parsed.secret as Hex, salt: parsed.salt as Hex, signingKey: parsed.signingKey as Hex };
  } catch {
    return undefined;
  }
};

/**
 * Staging passes each secret may use in a round: the server accepts `k < max_requests` once per tag. A counter is spent
 * once the server accepted its pass or answered that its tag was already used, never for a refusal that left the tag alone.
 */
export const stagingCounterKey = (program: Address, e3Id: bigint, slot: Address) =>
  `interfold-governance:staging-counter:v1:${program.toLowerCase()}:${e3Id}:${slot.toLowerCase()}`;

export const stagingCounter = (storage: KeyValueStorage) => ({
  /** The next unspent counter. */
  next(key: string): number {
    const next = Number(storage.getItem(key) ?? 0);
    if (!Number.isInteger(next) || next < 0) throw new Error("The staging counter in this browser is corrupt.");
    return next;
  },
  /** Records `counter` as spent, so the next counter is the one after it. */
  spend(key: string, counter: number): void {
    if (counter >= this.next(key)) storage.setItem(key, String(counter + 1));
  },
});

/** The error for a voter who has used every pass the server accepts in a round. */
export const outOfStagingPasses = (maxRequests: number) =>
  new Error(`This wallet has used all ${maxRequests} ballots and masks the CRISP server accepts from one voter in a round.`);
