export function scheduleVotingStart(earliestStart: bigint, bufferSeconds: number): bigint {
  const normalizedBuffer = Number.isFinite(bufferSeconds) ? Math.max(0, Math.floor(bufferSeconds)) : 0;
  return earliestStart + BigInt(normalizedBuffer);
}

export function isVotingOpenAt(now: bigint, votingStart: bigint, commitmentDeadline: bigint): boolean {
  return now >= votingStart && now < commitmentDeadline;
}
