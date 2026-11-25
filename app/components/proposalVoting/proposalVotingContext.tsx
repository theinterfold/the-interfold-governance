import type { ReactNode } from "react";
import { BallotDisclosure } from "./ballotDisclosure";
import styles from "./proposalVotingContext.module.css";

/** Personal participation remains visible; supporting facts and activity share one disclosure. */
export function ProposalVotingContext({
  personalVote,
  details,
}: {
  personalVote?: ReactNode;
  details: ReactNode;
}) {
  return (
    <div className="proposal-ballot-context">
      {personalVote}
      <BallotDisclosure title="Voting details" className={styles.details}>
        {details}
      </BallotDisclosure>
    </div>
  );
}
