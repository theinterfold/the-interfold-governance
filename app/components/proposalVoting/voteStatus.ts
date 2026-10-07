export type VoteStatus = "confirmed" | "submitted" | "not-voted" | "unknown" | "loading" | "disconnected";

/** Only a successful contract read can establish that a public wallet did not vote. */
export function publicVoteStatus(connected: boolean, option?: number, failed = false): VoteStatus {
  if (!connected) return "disconnected";
  if (failed) return "unknown";
  if (option === undefined) return "loading";
  if (option === 0) return "not-voted";
  return [1, 2, 3].includes(option) ? "confirmed" : "unknown";
}
