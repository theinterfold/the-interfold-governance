import { BallotPanel } from "@/components/proposalVoting/ballot";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import type { SubmissionRecoveryState } from "../../utils/pendingSubmission";

export type SubmissionRecovery = {
  kind: "vote" | "mask";
  state: SubmissionRecoveryState;
  busy: boolean;
  message?: string;
};

/** An uncertain send is neither a failed ballot nor permission to sign another one. */
export function PendingSubmissionCard({
  recovery,
  onRecover,
}: {
  recovery: SubmissionRecovery;
  onRecover: () => Promise<void>;
}) {
  const { state, busy, kind, message } = recovery;
  const ready = state === "ready";
  const checking = state === "checking" || state === "pending";
  return (
    <BallotPanel title={ready ? "Your ballot is ready to send" : "Checking your submission"} mode={kind}>
      <div className="vp-body">
        <p className="vp-note" role="status">
          {ready
            ? "The server has your encrypted ballot. Continue to finish sending it."
            : state === "pending"
              ? "Your ballot is queued. We’re checking whether it has been submitted."
              : "We haven’t confirmed this submission yet. Check it before starting another ballot."}
        </p>
        <p className="ballot-mask-hint">
          {ready || checking
            ? "This checks the original ballot without asking you to sign a new one."
            : "Retrying sends the same encrypted ballot, with the same voting power. No new signature is needed."}
        </p>
        {message && (
          <p className="vp-submission-error" role="alert">
            {message}
          </p>
        )}
        <div className="vp-cta">
          <PowerAction intent="vote" disabled={busy} isLoading={busy} onClick={() => void onRecover()}>
            {ready ? "Continue submission" : checking ? "Check status" : "Retry same submission"}
          </PowerAction>
        </div>
      </div>
    </BallotPanel>
  );
}
