import { zeroAddress, type Address } from "viem";
import type { OwnedLock, QueuedExit } from "../hooks/useVeLocks";

export type AllocationKind =
  | "wallet"
  | "delegated"
  | "self"
  | "undelegated"
  | "cooldown"
  | "ready"
  | "bonded"
  | "vesting";
export type FoldAllocation =
  | { status: "unavailable" }
  | { status: "ready"; total: bigint; parts: { kind: AllocationKind; amount: bigint }[] };

export type FoldHoldingKind = "wallet" | "locked" | "bonded" | "vesting";

/** Group lock states into one asset category without changing the ownership total. */
export function foldHoldingParts(
  parts: { kind: AllocationKind; amount: bigint }[],
  { includeVestingInLocked = false }: { includeVestingInLocked?: boolean } = {}
) {
  const amounts: Record<FoldHoldingKind, bigint> = { wallet: 0n, locked: 0n, bonded: 0n, vesting: 0n };
  for (const { kind, amount } of parts) {
    const category =
      kind === "vesting" && includeVestingInLocked
        ? "locked"
        : kind === "wallet" || kind === "bonded" || kind === "vesting"
          ? kind
          : "locked";
    amounts[category] += amount;
  }
  return (Object.entries(amounts) as [FoldHoldingKind, bigint][])
    .filter(([kind]) => !includeVestingInLocked || kind !== "vesting")
    .map(([kind, amount]) => ({ kind, amount }));
}

/**
 * Wallet FOLD that the token will not move yet: the held balance minus what `transferableBalanceOf`
 * reports. Derived from the token's own answer, never from `lockedBalanceOf`: a bond offsets the
 * vesting lock, so the raw lock can exceed what the wallet holds. Unknown until both reads arrive.
 */
export function unvestedBalance(balance?: bigint, transferable?: bigint) {
  if (balance === undefined || transferable === undefined) return undefined;
  return balance > transferable ? balance - transferable : 0n;
}

/** Asset ownership, not getVotes: inbound delegation is not a holding.
 * `vesting` is the part of the ERC20 wallet balance that cannot move yet (see `unvestedBalance`). It is already
 * in the wallet balance, net of bonded funds; separate it, never add it twice.
 * See the verified BondedVotes _lockedVotes / balanceOf implementation:
 * https://etherscan.io/address/0x028deEA644258c78b1B5B2eacF469F5D781Fb43E#code
 */
export function foldAllocation({
  account,
  delegate,
  walletBalance,
  bonded,
  vesting,
  ownedLocks,
  queuedExits,
}: {
  account?: Address;
  delegate?: Address;
  walletBalance?: bigint;
  bonded?: bigint;
  vesting?: bigint;
  ownedLocks?: readonly OwnedLock[];
  queuedExits?: readonly QueuedExit[];
}): FoldAllocation {
  if (
    !account ||
    walletBalance === undefined ||
    bonded === undefined ||
    vesting === undefined ||
    !ownedLocks ||
    !queuedExits
  )
    return { status: "unavailable" };
  // Incomplete or inconsistent reads must not produce a plausible but incorrect total.
  if (walletBalance < 0n || bonded < 0n || vesting < 0n || vesting > walletBalance) return { status: "unavailable" };
  if (ownedLocks.some((lock) => lock.delegated) && (!delegate || delegate === zeroAddress))
    return { status: "unavailable" };
  const ids = [...ownedLocks, ...queuedExits].map((lock) => lock.tokenId.toString());
  if (new Set(ids).size !== ids.length || [...ownedLocks, ...queuedExits].some((lock) => lock.amount < 0n))
    return { status: "unavailable" };

  const amounts: Record<AllocationKind, bigint> = {
    wallet: walletBalance - vesting,
    delegated: 0n,
    self: 0n,
    undelegated: 0n,
    cooldown: 0n,
    ready: 0n,
    bonded,
    vesting,
  };
  for (const lock of ownedLocks) {
    const kind = !lock.delegated
      ? "undelegated"
      : delegate?.toLowerCase() === account.toLowerCase()
        ? "self"
        : "delegated";
    amounts[kind] += lock.amount;
  }
  for (const lock of queuedExits) amounts[lock.canExit ? "ready" : "cooldown"] += lock.amount;
  const parts = (Object.entries(amounts) as [AllocationKind, bigint][])
    .filter(([, amount]) => amount > 0n)
    .map(([kind, amount]) => ({ kind, amount }));
  return { status: "ready", parts, total: parts.reduce((sum, part) => sum + part.amount, 0n) };
}
