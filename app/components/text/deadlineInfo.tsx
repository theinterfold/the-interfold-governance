import type { ReactNode } from "react";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import styles from "./deadlineInfo.module.css";

/** Relative labels share one exact, accessible timestamp in UTC. */
export function DeadlineInfo({ label, endMs, children }: { label: string; endMs: number; children: ReactNode }) {
  const end = new Date(endMs);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(end);
  return (
    <PowerInfo compact={true} contentClassName={styles.tooltip} label={`${label} ${date}, ${clock}`} trigger={children}>
      <dl>
        <dt>{label}</dt>
        <dd>
          <time dateTime={end.toISOString()}>
            <span className={styles.date}>{date}</span>
            <span className={styles.clock}>{clock}</span>
          </time>
        </dd>
      </dl>
    </PowerInfo>
  );
}
