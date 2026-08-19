import { parseAbi } from "viem";

/**
 * The escrow's `EscrowIVotesAdapter` — where lock voting power is delegated.
 *
 * A fresh account's delegatee is address(0), and an UNDELEGATED lock carries NO voting power:
 * the adapter only checkpoints votes toward a delegatee. Calling `delegate(self)` once
 * activates every current lock and, from then on, new locks auto-delegate on creation.
 */
export const escrowAdapterAbi = parseAbi([
  "function delegates(address account) view returns (address)",
  "function getVotes(address account) view returns (uint256)",
  "function tokenIsDelegated(uint256 tokenId) view returns (bool)",
  "function delegate(address delegatee)",
]);
