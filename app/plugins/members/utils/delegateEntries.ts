import type { Address } from "viem";
import type { DelegateEntry } from "../hooks/useDelegates";

/** A connected wallet remains selectable even before it receives its first delegation. */
export function includeConnectedWallet(
  delegates: DelegateEntry[],
  address?: Address,
  votingPower?: bigint
): DelegateEntry[] {
  // An unavailable read is not evidence of zero voting power.
  if (!address || votingPower === undefined) return delegates;
  return [
    ...delegates.filter((entry) => entry.address.toLowerCase() !== address.toLowerCase()),
    { address, votingPower },
  ];
}
