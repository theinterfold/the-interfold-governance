import { parseAbi } from "viem";

/**
 * The escrow's exit queue (`DynamicExitQueue`). A queued lock is held by the escrow with a ticket
 * naming the original owner. `canExit` turns true once `minCooldown` seconds have passed since
 * `queuedAt`, after which `escrow.withdraw(tokenId)` burns the NFT and returns the FOLD.
 */
export const exitQueueAbi = parseAbi([
  "function cooldown() view returns (uint48)",
  "function feePercent() view returns (uint256)",
  "function ticketHolder(uint256 tokenId) view returns (address)",
  // `TicketV2`. Each ticket keeps the cooldown that was in force when its withdrawal began.
  "function queue(uint256 tokenId) view returns ((address holder, uint48 queuedAt, uint48 minCooldown, uint48 cooldown, uint16 feePercent, uint16 minFeePercent, uint256 slope))",
  "function canExit(uint256 tokenId) view returns (bool)",
]);
