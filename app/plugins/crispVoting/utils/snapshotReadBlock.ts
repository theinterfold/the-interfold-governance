/**
 * The block a snapshot timepoint must be read at.
 *
 * `BondedVotes.getPastVotes` is not a pure historical lookup. Two of its three terms are
 * checkpointed, but `_lockedVotes` walks the account's CURRENT locks and evaluates them against
 * the timepoint — the contract says so itself: "UNLIKE the other two halves this is not a
 * checkpointed history ... it is not a general-purpose past balance and must not be treated as
 * one." Asked at chain head, the same timepoint answers differently once a holder's locks change,
 * so any check against a census taken earlier drifts into false mismatches, and a ballot leaf
 * built from today's answer would not match the tree the server built at the snapshot.
 *
 * Reads must therefore be pinned to a block. The one to use is the first block AT OR AFTER the
 * timepoint: `getBlockAtTimestamp` resolves the block at or *before* it, and that block's own
 * timestamp can precede the snapshot, in which case the timepoint is still in its future and the
 * call reverts with `ERC5805FutureLookup(timepoint, clock)`.
 *
 * @param resolvedBlock The block `getBlockAtTimestamp` returned (at or before the timepoint).
 * @param resolvedTimestamp That block's own timestamp.
 * @param timepoint The snapshot timepoint the reads use.
 * @returns The block to evaluate the reads at.
 */
export function snapshotReadBlock(resolvedBlock: bigint, resolvedTimestamp: bigint, timepoint: bigint): bigint {
  // Already at or after the timepoint: reading here is safe and is the exact snapshot block.
  if (resolvedTimestamp >= timepoint) return resolvedBlock;

  // The resolved block predates the timepoint, so the next one is the first that covers it.
  return resolvedBlock + 1n;
}
