/** Formats a duration in seconds as a short human-readable string. */
export function formatDurationSeconds(seconds: number): string {
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${seconds} seconds`;
}

/**
 * Display-only voting window note: the duration is governed by the SPP stage
 * configuration, not chosen per proposal.
 */
export const StageDurationNote = ({ durationSeconds }: { durationSeconds?: number }) => {
  return (
    <div className="mb-6 flex flex-col gap-0.5 md:gap-1">
      <p className="field-section-label">Voting period</p>
      <p className="text-sm font-normal leading-normal text-neutral-500 md:text-base">
        {durationSeconds
          ? `Voting runs for ${formatDurationSeconds(durationSeconds)} from creation, followed by the foundation veto window. The duration is set by the governance stage configuration.`
          : "The voting duration is set by the governance stage configuration."}
      </p>
    </div>
  );
};
