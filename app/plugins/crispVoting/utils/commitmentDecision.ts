/**
 * What the vote flow does with the CRISP server's view of one staged ballot.
 *
 * The server stages every ballot first. Staging stores the ciphertext and signs the availability
 * attestation that `publishInput` requires, so no route skips it. The server's worker then chooses
 * who sends the commitment. It sends the commitment itself (the relay), or it answers
 * `ready_for_commitment` with the attested payload for the voter's wallet to send. The wallet sends
 * when the voter asked for that (`send_from_wallet`), when the relay is off, when a relay limit is
 * reached, or when the relay key cannot pay. Until the worker chooses, the job is
 * `pending_commitment` and has no payload.
 */

/** The CRISP server's view of one staged ballot (its `AvailabilityJobView`). */
export interface VoteResponse {
  status: string;
  tx_hash: string | null;
  message: string | null;
  /** Only the broadcast answer carries this. */
  is_vote_update?: boolean | null;
  /**
   * The ATTESTED `publishInput` payload, present once the server has signed the input.
   *
   * This is `InputCommitmentEnvelope` — seven fields, including the
   * `availabilityAttestationExpiresAt` deadline and the signature the CRISP
   * `inputAvailabilitySigner` produced over it. A client cannot build it: only the server holds
   * that key. Submit this verbatim; never re-encode it locally.
   */
  encoded_proof?: string | null;
  job_id?: string | null;
}

export type CommitmentStep =
  /** The server has not chosen who sends the commitment. Read the job again. */
  | { action: "wait"; jobId: string }
  /** The commitment is on-chain. `txHash` is null when the server did not send it. */
  | { action: "committed"; txHash: string | null }
  /** The wallet sends the attested payload. */
  | { action: "submit"; payload: string }
  | { action: "error"; reason: string };

/**
 * The next step for one view.
 *
 * The transaction hash comes first. A relayed job reports its hash AND the payload, because the
 * payload stays available to a client that wants the wallet path after a relay failure. Sending
 * it again would be a second commitment of the same statement, which `publishInput` refuses with
 * `InputAlreadyCommitted`.
 */
export function decideCommitmentStep(view: VoteResponse): CommitmentStep {
  if (view.status === "failed_broadcast") {
    return { action: "error", reason: view.message ?? "The server could not submit this ballot." };
  }
  if (view.tx_hash) {
    return { action: "committed", txHash: view.tx_hash };
  }
  if (view.status === "pending_commitment") {
    return view.job_id
      ? { action: "wait", jobId: view.job_id }
      : { action: "error", reason: view.message ?? "The server did not return a job for this ballot." };
  }
  if (view.status === "ready_for_commitment" && view.encoded_proof) {
    return { action: "submit", payload: view.encoded_proof };
  }
  // The server reports no hash for a commitment that it did not send, for example one that the
  // voter's wallet sent earlier.
  if (view.status === "pending_availability" || view.status === "success") {
    return { action: "committed", txHash: null };
  }
  return {
    action: "error",
    reason: view.message ?? "The server has not returned an attested payload for this ballot yet.",
  };
}

/** How often, and for how long, the vote flow asks whether the server chose who sends a ballot. */
export const COMMITMENT_DECISION_POLL_MS = 10_000;
export const COMMITMENT_DECISION_WAIT_MS = 600_000;

/**
 * Read a `pending_commitment` job until the server chooses who sends its commitment. The worker
 * can take minutes to reach a job when many jobs wait.
 *
 * @param readView Reads the job: a view, `null` when the server does not know the job, or
 *   `undefined` when the read failed. A failed read counts as no answer yet.
 * @returns The first view that is not `pending_commitment`, `null` when the server does not know
 *   the job, or `undefined` when the wait ends or `isCancelled` returns true.
 */
export async function waitForCommitmentDecision(
  jobId: string,
  readView: (jobId: string) => Promise<VoteResponse | null | undefined>,
  isCancelled: () => boolean,
  { pollMs = COMMITMENT_DECISION_POLL_MS, waitMs = COMMITMENT_DECISION_WAIT_MS } = {}
): Promise<VoteResponse | null | undefined> {
  const deadline = Date.now() + waitMs;
  while (!isCancelled()) {
    const view = await readView(jobId);
    if (view === null || (view && view.status !== "pending_commitment")) return view;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return undefined;
}
