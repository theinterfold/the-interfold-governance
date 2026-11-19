// Follow completed physics frames. Never extrapolate through a white boundary,
// and never accumulate wall-clock debt that would replay old pointer gestures.
export function advancePresentation(time, elapsedDelta, latestTime, rate, interactive = false) {
  // Cursor frames already contain swept, feasible material positions. Showing
  // the latest accepted frame avoids smoothing the same movement a second time.
  if (interactive) return latestTime;
  return Math.min(latestTime, time + Math.max(0, Math.min(0.1, elapsedDelta)) * rate);
}

export function nextSolverTime(displayTime, requestedTime, step, lead = step / 2) {
  // At most one pending fixed step; optional look-ahead absorbs expensive frames.
  // On slower devices the artwork slows down instead of building a catch-up queue.
  return displayTime + lead + 1e-9 >= requestedTime
    ? Math.round((requestedTime + step) / step) * step
    : null;
}

// Preserve the paint cadence across RAF jitter. Resetting the deadline to the
// actual paint time loses the fractional remainder and skips available frames.
// A late callback paints once and skips missed deadlines; it never catches up.
export function nextPaintDeadline(now, deadline, interval = 1000 / 60) {
  if (!Number.isFinite(deadline)) return now + interval;
  if (now + .75 < deadline) return null;
  return deadline + Math.max(1, Math.floor((now - deadline) / interval) + 1) * interval;
}
