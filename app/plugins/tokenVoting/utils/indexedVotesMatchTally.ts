import type { ServerVote } from "@/utils/crispIndexer";
import { VoteOption, type Tally } from "./types";

/** Check indexer coverage against the observed chain tally, including replacement votes. */
export function indexedVotesMatchTally(votes: ServerVote[], tally: Tally): boolean {
  const latest = new Map<string, ServerVote>();
  for (const vote of votes) {
    const voter = vote.voter.toLowerCase();
    const previous = latest.get(voter);
    if (!previous || vote.block >= previous.block) latest.set(voter, vote);
  }
  const totals = { yes: 0n, no: 0n, abstain: 0n };
  for (const vote of latest.values()) {
    const power = BigInt(vote.voting_power);
    if (vote.vote_option === VoteOption.Yes) totals.yes += power;
    else if (vote.vote_option === VoteOption.No) totals.no += power;
    else if (vote.vote_option === VoteOption.Abstain) totals.abstain += power;
    else return false;
  }
  return totals.yes === tally.yes && totals.no === tally.no && totals.abstain === tally.abstain;
}
