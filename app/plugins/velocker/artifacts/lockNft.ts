import { parseAbi } from "viem";

/**
 * The lock receipt NFT (ERC721 Enumerable). `beginWithdrawal` has the ESCROW pull the NFT via
 * `transferFrom(owner, escrow)`, and the Lock contract does NOT auto-approve the escrow — so
 * starting a withdrawal needs a per-token `approve(escrow, tokenId)` first.
 */
export const lockNftAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function approve(address to, uint256 tokenId)",
]);
