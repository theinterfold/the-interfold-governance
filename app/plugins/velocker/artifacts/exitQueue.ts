import { parseAbi } from "viem";

/**
 * The escrow's exit queue. A queued lock is held by the escrow with a ticket naming the
 * original owner; `canExit` turns true once the cooldown has elapsed past the ticket's
 * `exitDate`, after which `escrow.withdraw(tokenId)` burns the NFT and returns the FOLD.
 */
export const exitQueueAbi = parseAbi([
  "function cooldown() view returns (uint48)",
  "function feePercent() view returns (uint256)",
  "function ticketHolder(uint256 tokenId) view returns (address)",
  "function queue(uint256 tokenId) view returns ((address holder, uint256 exitDate))",
  "function canExit(uint256 tokenId) view returns (bool)",
  "event ExitQueued(uint256 indexed tokenId, address indexed holder, uint256 exitDate)",
]);
