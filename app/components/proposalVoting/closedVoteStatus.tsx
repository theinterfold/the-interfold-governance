import type { VoteStatus } from "./voteStatus";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import styles from "./closedVoteStatus.module.css";

const labels: Record<VoteStatus, string> = {
  confirmed: "You voted",
  submitted: "Submission pending",
  "not-voted": "You did not vote",
  unknown: "Unable to confirm",
  loading: "Checking your vote…",
  disconnected: "Wallet not connected",
};

/** Closed ballots prioritize participation; voting power belongs to the open ballot. */
export function ClosedVoteStatus({
  status,
  secret = false,
  choice,
  onConnect,
}: {
  status: VoteStatus;
  secret?: boolean;
  choice?: string;
  onConnect: () => void;
}) {
  const description =
    status === "unknown"
      ? secret
        ? "No vote receipt is available in this session. A vote from another session or device cannot be confirmed here."
        : "Your vote could not be checked. Please try again shortly."
      : status === "submitted"
        ? "The relayer received your ballot. On-chain confirmation is still unavailable."
        : status === "confirmed" && secret
          ? "Your ballot was submitted. Your choice remains private."
          : undefined;
  return (
    <section className={styles.status} aria-label="Your vote" aria-live="polite">
      <div className={styles.row}>
        <span>Your vote</span>
        <strong>
          {labels[status]}
          {status === "confirmed" && !secret && choice ? ` · ${choice}` : ""}
        </strong>
      </div>
      {description && <p>{description}</p>}
      {status === "disconnected" && <PowerAction onClick={onConnect}>Connect wallet</PowerAction>}
    </section>
  );
}
