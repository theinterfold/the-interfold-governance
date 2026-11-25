import type { ReactNode } from "react";
import { BallotDisclosure } from "./ballotDisclosure";
import styles from "./proposalVotingContext.module.css";

export function VotingDetailSection({ title, summary, children }: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <BallotDisclosure className={styles.section} title={
      <span className={styles.sectionHeading}>
        <span>{title}</span>
        {summary != null && <span className={styles.summary}>{summary}</span>}
      </span>
    }>
      <div className={styles.sectionBody}>{children}</div>
    </BallotDisclosure>
  );
}
