import type { ReactNode } from "react";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import styles from "./deadlineInfo.module.css";

const UTC_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const UTC_CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
  timeZoneName: "short",
});

/** The one exact timestamp format for deadlines: "12 Jun 2026" and "14:00:00 UTC". */
export function utcTimestamp(atMs: number): { date: string; clock: string } {
  const at = new Date(atMs);
  return { date: UTC_DATE.format(at), clock: UTC_CLOCK.format(at) };
}

/** Relative labels share one exact, accessible timestamp in UTC. */
export function DeadlineInfo({ label, atMs, children }: { label: string; atMs: number; children: ReactNode }) {
  const { date, clock } = utcTimestamp(atMs);
  return (
    <PowerInfo compact={true} contentClassName={styles.tooltip} label={`${label} ${date}, ${clock}`} trigger={children}>
      <dl>
        <dt>{label}</dt>
        <dd>
          <time dateTime={new Date(atMs).toISOString()}>
            <span className={styles.date}>{date}</span>
            <span className={styles.clock}>{clock}</span>
          </time>
        </dd>
      </dl>
    </PowerInfo>
  );
}
