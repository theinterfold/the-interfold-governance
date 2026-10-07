import { DeadlineInfo } from "@/components/text/deadlineInfo";
import { useEffect, useState } from "react";

export function formatEndsIn(endMs: number, nowMs = Date.now()): string {
  const seconds = Math.max(0, Math.ceil((endMs - nowMs) / 1000));
  if (!seconds) return "Voting ended";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Ends in ${days ? `${days}d ` : ""}${days || hours ? `${pad(hours)}h ` : ""}${pad(minutes)}m ${pad(remainder)}s`;
}

/** A single clock for proposal rows and full pages; only this small label ticks. */
export function ProposalCountdown({ endMs, onEnd }: { endMs: number; onEnd?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const ended = now >= endMs;

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endMs) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [endMs]);

  useEffect(() => {
    if (ended) onEnd?.();
  }, [ended, onEnd]);

  return (
    <DeadlineInfo label="Voting ends" endMs={endMs}>
      <time className="proposal-countdown" dateTime={new Date(endMs).toISOString()} role="timer" aria-live="off">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span>{formatEndsIn(endMs, now)}</span>
      </time>
    </DeadlineInfo>
  );
}
