import { parseAbi } from "viem";

export const iVotesAbi = parseAbi([
  "function getPastVotes(address account, uint256 blockNumber) view returns (uint256)",
  "function getVotes(address owner) view returns (uint256)",
  "function getPastVotes(address account, uint256 timepoint) external view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function delegate(address delegatee) external",
  "function delegates(address account) public view returns (address)",
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function decimals() view returns (uint8)",
]);
