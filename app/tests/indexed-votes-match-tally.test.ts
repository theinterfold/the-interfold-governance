import { expect, test } from "bun:test";
import { indexedVotesMatchTally } from "../plugins/tokenVoting/utils/indexedVotesMatchTally";
import { VoteOption } from "../plugins/tokenVoting/utils/types";
import type { ServerVote } from "@/utils/crispIndexer";

const wallet = "0x1111111111111111111111111111111111111111";
function ballot(block: number, option: VoteOption): ServerVote {
  return { voter: wallet, block, vote_option: option, voting_power: "10", transaction_hash: null };
}

test("an empty index is only current while the chain tally is empty", () => {
  expect(indexedVotesMatchTally([], { yes: 0n, no: 0n, abstain: 0n })).toBe(true);
  expect(indexedVotesMatchTally([], { yes: 10n, no: 0n, abstain: 0n })).toBe(false);
});

test("replacement votes change a column even when the total stays the same", () => {
  const first = ballot(1, VoteOption.Yes);
  const replacement = ballot(2, VoteOption.Abstain);
  const tally = { yes: 0n, no: 0n, abstain: 10n };
  expect(indexedVotesMatchTally([first], tally)).toBe(false);
  expect(indexedVotesMatchTally([replacement, first], tally)).toBe(true);
});
