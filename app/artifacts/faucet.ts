import { parseAbi } from "viem";

/**
 * Testnet faucet. A single `faucet()` call drips a fixed amount of both the DAO
 * voting token (FOLD) and the CRISP fee token to the caller — the FOLD token
 * itself exposes no public `mint`, so this is the only way to fund a test wallet.
 */
export const faucetAbi = parseAbi([
  "function faucet() external",
  "function fold() view returns (address)",
  "function feeToken() view returns (address)",
]);
