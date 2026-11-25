import type { ReactNode } from "react";
import { VotingDetailSection } from "./votingDetailSection";
import styles from "./proposalVotingContext.module.css";

/** The voting method supplies its own turnout and quorum calculation. */
export function ParticipationDetails({ turnout, voted, minimum, threshold, total, reached, encrypted, children }: {
  turnout?: string;
  voted?: string;
  minimum: string;
  threshold?: string;
  total: string;
  reached?: boolean;
  encrypted?: boolean;
  children?: ReactNode;
}) {
  const summary = encrypted ? "Awaiting tally" : turnout && `${turnout} turnout`;
  return (
    <VotingDetailSection title="Participation" summary={summary}>
      {encrypted && <p>Turnout becomes visible when the encrypted tally is published.</p>}
      <dl className={styles.facts}>
        {voted && <div><dt>Voting power cast</dt><dd>{voted}</dd></div>}
        <div><dt>Required minimum</dt><dd>{minimum}{threshold && <small>{threshold}</small>}</dd></div>
        <div><dt>Total voting power</dt><dd>{total}</dd></div>
        {reached != null && <div><dt>Quorum</dt><dd>{reached ? "Met" : "Below minimum"}</dd></div>}
      </dl>
      {children}
    </VotingDetailSection>
  );
}
