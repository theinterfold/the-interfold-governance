import { zeroAddress, type Address } from "viem";

/** Tokens in the owner's activated locks, whoever receives their voting power. */
export function delegatedLockTokens(
  delegate?: Address,
  locks?: readonly { delegated: boolean; amount: bigint }[]
): bigint | undefined {
  if (!delegate) return undefined;
  if (delegate === zeroAddress) return 0n;
  return locks?.reduce((total, lock) => total + (lock.delegated ? lock.amount : 0n), 0n);
}
