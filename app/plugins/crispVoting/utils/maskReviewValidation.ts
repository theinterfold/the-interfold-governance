import { isAddress } from "viem";
import type { EligibleVoter } from "./types";

type Recipient = { mode: "random" | "address"; target: string };

/** Random recipients are resolved on send; explicitly chosen wallets must already be eligible. */
export function maskReviewIssue(entries: Recipient[], voters?: EligibleVoter[], lookupFailed = false) {
  if (lookupFailed) return "unavailable";
  if (!voters) return "loading";
  if (!voters.length) return "no-voters";
  if (!entries.length) return "no-masks";
  for (const entry of entries) {
    if (entry.mode === "random") continue;
    const address = entry.target.trim();
    if (!address) return "missing-wallet";
    if (!isAddress(address)) return "invalid-wallet";
    if (!voters.some(voter => voter.address.toLowerCase() === address.toLowerCase())) return "ineligible-wallet";
  }
  return null;
}
