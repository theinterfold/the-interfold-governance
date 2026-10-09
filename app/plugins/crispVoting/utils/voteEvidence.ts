import type { VoteStatus } from "@/components/proposalVoting/voteStatus";

export type VoteScope = { chainId: number; plugin: string; roundId: bigint; voter: string };
export type VoteEvidence = Extract<VoteStatus, "confirmed" | "submitted">;
const scopeKey = (scope: VoteScope) =>
  `${scope.chainId}:${scope.plugin.toLowerCase()}:${scope.roundId}:${scope.voter.toLowerCase()}`;

/** Session memory only: no choice, weight, proof, mask history or persistent wallet linkage. */
export function createVoteEvidenceStore() {
  const records = new Map<string, VoteEvidence>();
  const listeners = new Set<() => void>();
  return {
    get: (scope: VoteScope) => records.get(scopeKey(scope)),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    record: (scope: VoteScope, evidence: VoteEvidence, isMask = false) => {
      if (isMask) return;
      const key = scopeKey(scope);
      // A later unconfirmed update cannot erase evidence that this wallet already voted.
      if (records.get(key) === "confirmed") return;
      records.set(key, evidence);
      listeners.forEach((listener) => listener());
    },
  };
}

export const voteEvidence = createVoteEvidenceStore();
