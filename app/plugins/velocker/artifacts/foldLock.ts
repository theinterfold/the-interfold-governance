import { parseAbi } from "viem";

/**
 * FOLD's lock-aware balance reads.
 *
 * `balanceOf` is NOT what may be locked. FOLD carries vesting/claim locks and blocks any
 * transfer above `transferableBalanceOf` in `_update`, so an escrow `createLock` of an amount
 * the wallet holds but has not yet vested reverts inside the TOKEN — as
 * `InsufficientUnlockedBalance(account, spendable, value)`, selector `0x3f0c4e2d` — long before
 * the escrow gets a say. Bonded FOLD offsets the locked amount, which is why this is a contract
 * read rather than a subtraction the app could do itself.
 */
export const foldLockAbi = parseAbi([
  "function transferableBalanceOf(address account) view returns (uint256)",
  "function lockedBalanceOf(address account) view returns (uint256)",
]);
