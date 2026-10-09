import { useId, type ReactNode } from "react";
import styles from "./ballotActivity.module.css";

/** Activity is revealed by Voting details, without a second disclosure. */
export function BallotActivity({ title, children }: { title: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className={styles.activity} aria-labelledby={id}>
      <h4 className={styles.title} id={id}>
        {title}
      </h4>
      {children}
    </section>
  );
}
