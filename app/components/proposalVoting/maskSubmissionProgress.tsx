import styles from "./maskSubmissionProgress.module.css";

/** One segment per mask; only confirmed receipts advance the completed count. */
export function MaskSubmissionProgress({ total, confirmed, current, failed = false }: {
  total: number;
  confirmed: number;
  current: number;
  failed?: boolean;
}) {
  if (total < 2) return null;
  const count = Math.max(0, Math.min(confirmed, total));
  const working = Math.min(total - 1, Math.max(count, current));
  return <div>
    <div className={styles.context}>
      <strong>{count === total ? "All masks confirmed" : `Mask ${working + 1} of ${total}`}</strong>
      <span>{count} confirmed</span>
    </div>
    <ol className={styles.progress} aria-label={`Mask submission progress — ${count} of ${total} confirmed`}>
      {Array.from({ length: total }, (_, index) => {
        const state = index < count ? "confirmed" : index === working ? failed ? "error" : "current" : "waiting";
        const active = state === "current" || state === "error";
        const label = state === "confirmed" ? "Confirmed" : state === "error" ? "Needs attention" : state === "current" ? "In progress" : "Waiting";
        return <li key={index} data-state={state} aria-current={active ? "step" : undefined} aria-label={`Mask ${index + 1}: ${label}`}>
          <span className={styles.segment} aria-hidden="true"/>
        </li>;
      })}
    </ol>
  </div>;
}
