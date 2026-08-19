import { parseAbi } from "viem";

/**
 * The slice of Aragon's `VotingEscrowIncreasing` (the "velocker") the app drives.
 *
 * Locking transfers FOLD into the escrow and mints a lock NFT; voting power accrues to the
 * lock and is delegated through the escrow's IVotes adapter (`ivotesAdapter()`), never through
 * the token. Withdrawal is two-phase: `beginWithdrawal` moves the NFT into the exit queue
 * (voting power stops immediately), and `withdraw` returns the FOLD once the queue's cooldown
 * has passed.
 */
export const votingEscrowAbi = parseAbi([
  // satellite contracts, read once — everything else hangs off the escrow address
  "function token() view returns (address)",
  "function lockNFT() view returns (address)",
  "function queue() view returns (address)",
  "function ivotesAdapter() view returns (address)",

  "function minDeposit() view returns (uint256)",
  "function totalLocked() view returns (uint256)",
  "function locked(uint256 tokenId) view returns ((uint208 amount, uint48 start))",
  "function votingPower(uint256 tokenId) view returns (uint256)",
  "function votingPowerForAccount(address account) view returns (uint256)",

  "function createLock(uint256 value) returns (uint256)",
  "function beginWithdrawal(uint256 tokenId)",
  "function cancelWithdrawalRequest(uint256 tokenId)",
  "function withdraw(uint256 tokenId)",
]);
