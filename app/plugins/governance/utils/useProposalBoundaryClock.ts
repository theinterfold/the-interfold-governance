import { useEffect, useState } from "react";

/** Rerender proposal status when the voting window opens or closes. */
export function useProposalBoundaryClock(startMs?: number, endMs?: number): number {
  const [nowMs, setNowMs] = useState(Date.now);

  useEffect(() => {
    const next = [startMs, endMs]
      .filter((value): value is number => value !== undefined && value > nowMs)
      .sort((a, b) => a - b)[0];
    if (next === undefined) return;
    const delay = Math.min(Math.max(next - Date.now() + 1, 1), 2_147_483_647);
    const timer = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [startMs, endMs, nowMs]);

  return nowMs;
}
