import { BallotPanel } from "@/components/proposalVoting/ballot";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import type { SubmissionRecoveryState } from "../../utils/pendingSubmission";

export type SubmissionRecovery = {
  kind: "vote" | "mask";
  state: SubmissionRecoveryState;
  busy: boolean;
  message?: string;
  canDiscard?: boolean;
};

/** An uncertain send is neither a failed ballot nor permission to sign another one. */
export function PendingSubmissionCard({
  recovery,
  onRecover,
  onDiscard,
}: {
  recovery: SubmissionRecovery;
  onRecover: () => Promise<void>;
  onDiscard?: () => void;
}) {
  const { state, busy, kind, message, canDiscard } = recovery;
  const unreadable = state === "unreadable";
  const ready = state === "ready";
  const checking = state === "checking" || state === "pending";
  return (
    <BallotPanel
      title={
        unreadable
          ? "Saved submission unavailable"
          : ready
            ? "Your ballot is ready to send"
            : "Checking your submission"
      }
      mode={kind}
    >
      <div className="vp-body">
        <p className="vp-note" role="status">
          {unreadable
            ? "This browser cannot restore the unfinished submission."
            : ready
              ? "The server has your encrypted ballot. Continue to finish sending it."
              : state === "pending"
                ? "Your ballot is queued. We’re checking whether it has been submitted."
                : "We haven’t confirmed this submission yet. Check it before starting another ballot."}
        </p>
        {!unreadable && (
          <p className="ballot-mask-hint">
            {ready || checking
              ? "This checks the original ballot without asking you to sign a new one."
              : "Retrying sends the same encrypted ballot, with the same voting power. No new signature is needed."}
          </p>
        )}
        {message && (
          <p className="vp-submission-error" role="alert">
            {message}
          </p>
        )}
        <div className="vp-cta">
          <PowerAction intent="vote" disabled={busy} isLoading={busy} onClick={() => void onRecover()}>
            {unreadable
              ? "Check again"
              : ready
                ? "Continue submission"
                : checking
                  ? "Check status"
                  : "Retry same submission"}
          </PowerAction>
          {canDiscard && onDiscard && (
            <PowerAction intent="destructive" affordance="discard" disabled={busy} onClick={onDiscard}>
              {unreadable ? "Clear saved submission" : "Discard and start again"}
            </PowerAction>
          )}
        </div>
        {canDiscard && onDiscard && (
          <p className="ballot-mask-hint">
            Clearing the saved data only affects this browser. A ballot already accepted by the server may still
            complete.
          </p>
        )}
      </div>
    </BallotPanel>
  );
}
