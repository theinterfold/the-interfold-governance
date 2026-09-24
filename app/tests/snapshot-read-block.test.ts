import { describe, expect, test } from "bun:test";
import { snapshotReadBlock } from "@/plugins/crispVoting/utils/snapshotReadBlock";

/**
 * Census checks and ballot leaves both read `getPastVotes` at a snapshot. On a token that mixes a
 * checkpointed history with a live lock walk that read is state-dependent, so it must be
 * evaluated at the snapshot's block rather than at chain head.
 *
 * The block has to be the first one that actually covers the timepoint: resolving to the block
 * at or before it can land one whose own timestamp is earlier, and reading there reverts
 * `ERC5805FutureLookup(timepoint, clock)`.
 */
describe("snapshotReadBlock", () => {
  const TIMEPOINT = 1789835494n;

  test("steps forward when the resolved block predates the timepoint", () => {
    // The resolved block is 11 seconds short of the timepoint, so reading there would revert.
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
