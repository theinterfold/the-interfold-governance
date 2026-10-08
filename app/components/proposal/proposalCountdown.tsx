import { DeadlineInfo } from "@/components/text/deadlineInfo";
import { useEffect, useState } from "react";

/** The edge of the voting window that a countdown runs to. */
export type VotingBoundary = "start" | "end";

const BOUNDARY_TEXT = {
  start: { label: "Voting starts", prefix: "Starts in", reached: "Voting started" },
  end: { label: "Voting ends", prefix: "Ends in", reached: "Voting ended" },
} as const;

export function formatCountdown(boundary: VotingBoundary, atMs: number, nowMs = Date.now()): string {
  const text = BOUNDARY_TEXT[boundary];
  const seconds = Math.max(0, Math.ceil((atMs - nowMs) / 1000));
  if (!seconds) return text.reached;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${text.prefix} ${days ? `${days}d ` : ""}${days || hours ? `${pad(hours)}h ` : ""}${pad(minutes)}m ${pad(remainder)}s`;
}

/** A single clock for proposal rows and full pages; only this small label ticks. */
export function ProposalCountdown({
  boundary,
  atMs,
  onEnd,
}: {
  boundary: VotingBoundary;
  atMs: number;
  /** Runs once the countdown reaches zero. */
  onEnd?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const ended = now >= atMs;

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= atMs) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [atMs]);

  useEffect(() => {
    if (ended) onEnd?.();
  }, [ended, onEnd]);

  return (
    <DeadlineInfo label={BOUNDARY_TEXT[boundary].label} atMs={atMs}>
      <time className="proposal-countdown" dateTime={new Date(atMs).toISOString()} role="timer" aria-live="off">
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
        <span>{formatCountdown(boundary, atMs, now)}</span>
      </time>
    </DeadlineInfo>
  );
}
