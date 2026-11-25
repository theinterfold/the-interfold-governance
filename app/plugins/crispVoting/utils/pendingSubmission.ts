import { decodeInputIdentity } from "@crisp-e3/sdk";
import { concatHex, encodeAbiParameters, keccak256, parseAbiParameters, stringToHex, type Hex } from "viem";
import type { VoteScope } from "./voteEvidence";
import type { VoteResponse } from "./commitmentDecision";
import { readServerRejection } from "./readServerRejection";

export type SubmissionRequest = {
  round_id: string;
  encoded_proof: string;
  address: string;
  send_from_wallet: boolean;
};
export type PendingSubmission = {
  jobId: string;
  kind: "vote" | "mask";
  prepare: boolean;
  request: SubmissionRequest;
  transactionHash?: Hex;
};
export type SubmissionRecoveryState = "checking" | "pending" | "unavailable" | "missing" | "ready" | "failed";

/** Mirrors CRISP's input_identity/job_id, independent of the Noir proof bytes or relay choice.
 * Source: theinterfold/CRISP, server/src/server/data_availability.rs.
 * Computing it BEFORE sending lets a lost HTTP response be recovered with a read only.
 */
export function submissionJobId(roundId: string, encodedProof: Hex): Hex {
  const input = decodeInputIdentity(encodedProof);
  const statement = encodeAbiParameters(parseAbiParameters("address, bytes32, uint40"), [
    input.slotAddress,
    input.encryptedVoteCommitment,
    input.parentIndexPlusOne,
  ]);
  return keccak256(
    concatHex([
      stringToHex("input"),
      stringToHex(BigInt(roundId).toString()),
      input.encryptedVoteHash,
      keccak256(statement),
    ])
  );
}

type SubmissionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const storageKey = (scope: VoteScope) =>
  `interfold-pending-submission-v1:${scope.chainId}:${scope.plugin.toLowerCase()}:${scope.roundId}:${scope.voter.toLowerCase()}`;

/** One unfinished encrypted submission per wallet/round in this tab, never ballot history.
 * Keeping the EXACT ciphertext/proof permits an idempotent retry when the first request never
 * arrived. No plaintext choice, weight or wallet signature is stored. Remove it on a definitive
 * answer; participation receipts remain in the separate, minimal voteEvidence store.
 */
export function createPendingSubmissionStore(storage: () => SubmissionStorage | undefined) {
  const records = new Map<string, PendingSubmission | undefined>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const get = (scope: VoteScope): PendingSubmission | undefined => {
    const key = storageKey(scope);
    if (records.has(key)) return records.get(key);
    const target = storage();
    if (!target) return;
    const raw = target.getItem(key);
    if (!raw) {
      records.set(key, undefined);
      return;
    }
    const saved = JSON.parse(raw) as PendingSubmission & { version?: number };
    const request = saved.request;
    if (
      saved.version !== 1 ||
      !["vote", "mask"].includes(saved.kind) ||
      typeof saved.prepare !== "boolean" ||
      !request ||
      typeof request.encoded_proof !== "string" ||
      typeof request.send_from_wallet !== "boolean" ||
      request.round_id !== scope.roundId.toString() ||
      typeof request.address !== "string" ||
      (saved.prepare && (saved.kind !== "vote" || !request.send_from_wallet)) ||
      (saved.transactionHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(saved.transactionHash)) ||
      submissionJobId(request.round_id, request.encoded_proof as Hex) !== saved.jobId ||
      decodeInputIdentity(request.encoded_proof as Hex).slotAddress.toLowerCase() !== request.address.toLowerCase() ||
      (saved.kind === "vote" && request.address.toLowerCase() !== scope.voter.toLowerCase())
    ) {
      throw new Error(
        "The saved submission could not be read. Keep this tab open and check its status before voting again."
      );
    }
    const value: PendingSubmission = {
      jobId: saved.jobId,
      kind: saved.kind,
      prepare: saved.prepare,
      transactionHash: saved.transactionHash,
      request: {
        round_id: request.round_id,
        encoded_proof: request.encoded_proof,
        address: request.address,
        send_from_wallet: request.send_from_wallet,
      },
    };
    records.set(key, value);
    return value;
  };
  return {
    get,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    save(scope: VoteScope, submission: PendingSubmission) {
      if (get(scope)) throw new Error("Check the unfinished submission before starting another ballot.");
      const target = storage();
      if (!target)
        throw new Error("Allow site storage before submitting so this ballot can be recovered after a reload.");
      // Fail before POST if the browser cannot retain a retryable submission.
      target.setItem(storageKey(scope), JSON.stringify({ version: 1, ...submission }));
      records.set(storageKey(scope), submission);
      notify();
    },
    markSent(scope: VoteScope, submission: PendingSubmission, transactionHash?: Hex) {
      const current = get(scope);
      if (current?.jobId !== submission.jobId) return;
      const next = { ...current, transactionHash };
      // Retain the known hash in memory even if storage becomes unavailable after broadcast.
      records.set(storageKey(scope), next);
      try {
        storage()?.setItem(storageKey(scope), JSON.stringify({ version: 1, ...next }));
      } finally {
        notify();
      }
      return next;
    },
    remove(scope: VoteScope, submission: PendingSubmission) {
      if (get(scope)?.jobId !== submission.jobId) return;
      // If removal fails, a refresh can only check/replay this same job, never invent a new vote.
      try {
        storage()?.removeItem(storageKey(scope));
      } catch {
        /* The in-memory answer remains usable. */
      }
      records.set(storageKey(scope), undefined);
      notify();
    },
  };
}

export const pendingSubmissions = createPendingSubmissionStore(() =>
  typeof window === "undefined" ? undefined : window.sessionStorage
);

export type BroadcastAnswer =
  | { kind: "accepted"; view: VoteResponse }
  | { kind: "rejected"; reason: string }
  | { kind: "unknown" };

/** A transport error, 5xx or malformed success cannot establish that nothing was accepted. */
export async function broadcastSubmission(
  baseUrl: string,
  request: SubmissionRequest,
  fetcher: typeof fetch = fetch,
  timeoutMs = 30_000
): Promise<BroadcastAnswer> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/voting/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: abort.signal,
    });
    if (!response.ok) {
      // Only explicit client rejections are definitive. A timeout/proxy/server failure may have
      // happened AFTER the durable job was written. An identical retry never redraws its weight.
      if ([400, 401, 403, 404, 413, 422, 429].includes(response.status)) {
        return { kind: "rejected", reason: await readServerRejection(response) };
      }
      return { kind: "unknown" };
    }
    const view = (await response.json()) as VoteResponse;
    return view &&
      typeof view.status === "string" &&
      view.job_id === submissionJobId(request.round_id, request.encoded_proof as Hex)
      ? { kind: "accepted", view }
      : { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}

/** A missing job can still be in admission. It is never permission to make a different ballot. */
export async function readSubmission(
  baseUrl: string,
  jobId: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15_000
): Promise<VoteResponse | null | undefined> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/voting/availability/${encodeURIComponent(jobId)}`, {
      signal: abort.signal,
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) return undefined;
    const view = (await response.json()) as VoteResponse;
    return view && typeof view.status === "string" && view.job_id === jobId ? view : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
