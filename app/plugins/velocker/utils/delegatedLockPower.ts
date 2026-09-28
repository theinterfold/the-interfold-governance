import { zeroAddress, type Address } from "viem";

/** Only the owner's activated locks count as outgoing delegation; never add the recipient's other votes. */
export function delegatedLockPower(
  owner?: Address,
  delegate?: Address,
  locks?: readonly { delegated: boolean; votingPower: bigint }[]
): bigint | undefined {
  if (!owner || !delegate) return undefined;
  if (delegate === zeroAddress || delegate.toLowerCase() === owner.toLowerCase()) return 0n;
  return locks?.reduce((total, lock) => total + (lock.delegated ? lock.votingPower : 0n), 0n);
}

/** Tokens in the owner's activated locks, regardless of who receives their voting power. */
export function delegatedLockTokens(
  delegate?: Address,
  locks?: readonly { delegated: boolean; amount: bigint }[]
): bigint | undefined {
  if (!delegate) return undefined;
  if (delegate === zeroAddress) return 0n;
  return locks?.reduce((total, lock) => total + (lock.delegated ? lock.amount : 0n), 0n);
}
