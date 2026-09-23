import { isAddress, zeroAddress, type Address } from "viem";

/** Resolve ownership before requesting any token approval. */
export function lockCreationRequest(amount: bigint, payer: Address, owner: Address) {
  if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
  if (!isAddress(owner) || owner === zeroAddress) throw new Error("Enter a valid lock owner address.");
  return owner.toLowerCase() === payer.toLowerCase()
    ? { functionName: "createLock" as const, args: [amount] as const }
    : { functionName: "createLockFor" as const, args: [amount, owner] as const };
}
