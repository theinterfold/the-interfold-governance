import { describe, expect, test } from "bun:test";
import { snapshotReadBlock } from "@/plugins/crispVoting/utils/snapshotReadBlock";

/**
 * Census checks and ballot leaves both read `getPastVotes` at a snapshot. On `BondedVotes` that
 * read is state-dependent — `_lockedVotes` walks live locks — so it must be evaluated at the
 * snapshot's block rather than at chain head, and the block has to be the first one that actually
 * covers the timepoint.
 *
 * The numbers below are the real mainnet round that exposed this: snapshot timepoint 1789835494,
 * which `getBlockAtTimestamp` resolves to block 26012771 (timestamp 1789835483, eleven seconds
 * early). Reading there reverts `ERC5805FutureLookup(1789835494, 1789835483)`; block 26012772
 * reproduces the server's census exactly.
 */
describe("snapshotReadBlock", () => {
  const TIMEPOINT = 1789835494n;

  test("steps forward when the resolved block predates the timepoint", () => {
    // The mainnet case: 26012771 is 11 seconds short, so reading there would revert.
    expect(snapshotReadBlock(26012771n, 1789835483n, TIMEPOINT)).toBe(26012772n);
  });

  test("stays put when the resolved block already covers the timepoint", () => {
    // An exact hit must not be skipped past — that would read one block too late.
    expect(snapshotReadBlock(26012772n, 1789835495n, TIMEPOINT)).toBe(26012772n);
  });

  test("stays put on an exact timestamp match", () => {
    expect(snapshotReadBlock(26012772n, TIMEPOINT, TIMEPOINT)).toBe(26012772n);
  });

  test("never returns a block before the one resolved", () => {
    // Guards the direction of the adjustment: off-by-one backwards reverts, not just misreads.
    const out = snapshotReadBlock(100n, 50n, 99n);
    expect(out >= 100n).toBe(true);
  });
});
