import type { ReactNode } from "react";
import { BallotDisclosure } from "./ballotDisclosure";
import styles from "./proposalVotingContext.module.css";

/** Personal participation remains visible; supporting facts and activity share one disclosure. */
export function ProposalVotingContext({
  networkProgress,
  personalVote,
  details,
  activity,
}: {
  networkProgress?: ReactNode;
  personalVote?: ReactNode;
  details: ReactNode;
  activity?: ReactNode;
}) {
  return (
    <div className="proposal-ballot-context">
      {networkProgress}
      {personalVote}
      <BallotDisclosure title="Voting details" className={styles.details}>
        {details}
        {activity && <div className={styles.activity}>{activity}</div>}
      </BallotDisclosure>
    </div>
  );
}
