import type { ReactNode } from "react";
import styles from "./statusGroupHeading.module.css";

/** Shared heading for status groups with actionable rows on a white panel. */
export function StatusGroupHeading({id, title, icon, tone = "neutral", count, description, help, trailing}: {
  id?: string; title: string; icon: ReactNode; tone?: "positive" | "neutral";
  count?: number; description?: string; help?: ReactNode; trailing?: ReactNode;
}) {
  return <header className={styles.header} data-status-group>
    <div className={styles.identity}>
      <h3 id={id} className={styles.label} data-tone={tone}>
        {icon}{title}{count !== undefined && <span>· {count}</span>}
      </h3>
      {help}
    </div>
    {trailing ?? (description && <p>{description}</p>)}
  </header>;
}
