import { parseAbi } from "viem";

/**
 * Testnet voting faucet (`contracts/src/testnet/VotingFaucet.sol`). A `faucet()` call tops the
 * caller's FOLD up to the next whole multiple of the CRISP voting floor (plus 1%), to at most five
 * floors, so one claim is the minimum to vote and each further claim adds one ballot weight. Wallet
 * FOLD and locked FOLD both count. It also sends `AMOUNT_FEE_TOKEN` fee tokens when the caller holds
 * less than that. `foldShortfall(account)` is the FOLD the next claim sends (0 at the cap).
 */
export const faucetAbi = parseAbi([
  "function faucet() external",
  "function fold() view returns (address)",
  "function feeToken() view returns (address)",
  "function foldShortfall(address account) view returns (uint256)",
  "function AMOUNT_FEE_TOKEN() view returns (uint256)",
  "error NothingToClaim()",
  "error FaucetEmpty(address token)",
]);
