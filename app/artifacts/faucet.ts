import { parseAbi } from "viem";

/**
 * Testnet faucet. A single `faucet()` call tops the caller up to a fixed amount
 * of both the DAO voting token (FOLD) and the CRISP fee token — the FOLD token
 * itself exposes no public `mint`, so this is the only way to fund a test wallet.
 *
 * It is a top-up, not a one-shot claim: each token is refilled independently
 * whenever the caller holds less than its `AMOUNT_*`, so a tester who spent
 * their fee tokens can replenish while still holding FOLD. `faucet()` reverts
 * with "You have enough tokens" only when neither side is below its threshold.
 */
export const faucetAbi = parseAbi([
  "function faucet() external",
  "function fold() view returns (address)",
  "function feeToken() view returns (address)",
  "function AMOUNT_FOLD() view returns (uint256)",
  "function AMOUNT_FEE_TOKEN() view returns (uint256)",
]);
