/**
 * Compact display form for a large (keccak-based) proposal id, e.g. 0x1f3a…b3d1.
 * TokenVoting v1.4 proposal ids are uint256(keccak(...)), so the raw decimal is unreadable.
 */
export function shortProposalId(id: bigint | string): string {
  const hex = (typeof id === "bigint" ? id : BigInt(id)).toString(16).padStart(4, "0");
  return `0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}
