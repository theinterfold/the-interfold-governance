import type { VoteStatus } from "@/components/proposalVoting/voteStatus";

export type VoteScope = { chainId: number; plugin: string; roundId: bigint; voter: string };
export type VoteEvidence = Extract<VoteStatus, "confirmed" | "submitted">;
type EvidenceStorage = Pick<Storage, "getItem" | "setItem">;
const scopeKey = (scope: VoteScope) =>
  `${scope.chainId}:${scope.plugin.toLowerCase()}:${scope.roundId}:${scope.voter.toLowerCase()}`;
const storageKey = (key: string) => `interfold-vote-evidence-v1:${key}`;
const validHash = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);

/** Participation only. Never serialize a choice, amount, signature, proof or mask history. */
export function createVoteEvidenceStore(storage?: () => EvidenceStorage | undefined) {
  const records = new Map<string, VoteEvidence>();
  const transactions = new Map<string, string>();
  const loaded = new Set<string>();
  const listeners = new Set<() => void>();
  const restore = (scope: VoteScope) => {
    const key = scopeKey(scope);
    if (loaded.has(key) || records.has(key)) return key;
    // Do not mark SSR as loaded: the browser still needs to read its own tab storage.
    let target: EvidenceStorage | undefined;
    try { target = storage?.(); } catch { return key; }
    if (!target) return key;
    loaded.add(key);
    try {
      const raw = target.getItem(storageKey(key));
      if (!raw) return key;
      const saved: unknown = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return key;
      const record = saved as Record<string, unknown>;
      if (record.version !== 1 || (record.status !== "submitted" && record.status !== "confirmed")) return key;
      if (record.txHash !== undefined && !validHash(record.txHash)) return key;
      records.set(key, record.status);
      if (validHash(record.txHash)) transactions.set(key, record.txHash);
    } catch { /* Unavailable or malformed storage must not prevent voting. */ }
    return key;
  };
  return {
    get: (scope: VoteScope) => records.get(restore(scope)),
    transaction: (scope: VoteScope) => transactions.get(restore(scope)),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    record: (scope: VoteScope, evidence: VoteEvidence, isMask = false, txHash?: string | null) => {
      if (isMask) return;
      const key = restore(scope);
      // A pending update cannot erase a previously confirmed vote.
      if (records.get(key) === "confirmed" && evidence !== "confirmed") return;
      if (txHash) transactions.set(key, txHash);
      records.set(key, evidence);
      try {
        const hash = transactions.get(key);
        storage?.()?.setItem(storageKey(key), JSON.stringify({
          version: 1, status: evidence, ...(validHash(hash) ? { txHash: hash } : {}),
        }));
      } catch { /* Retain immediate feedback in memory if browser storage is blocked. */ }
      listeners.forEach((listener) => listener());
    },
  };
}

// Survives reloads in this tab; cleared when the tab session ends. No cross-device tracking.
export const voteEvidence = createVoteEvidenceStore(() =>
  typeof window === "undefined" ? undefined : window.sessionStorage
);
