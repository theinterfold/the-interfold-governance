import { isAddress, toFunctionSignature, type AbiFunction, type Address } from "viem";
import type { RawAction } from "@/utils/types";

/** A function selected for another address must never be encoded into this action. */
export function functionBelongsToAbi(selected: AbiFunction | undefined, abi: readonly AbiFunction[]): boolean {
  return !!selected && abi.some((candidate) => toFunctionSignature(candidate) === toFunctionSignature(selected));
}

/** The dialog uses this for both its button state and its final submission guard. */
export function preparedActionMatchesTarget(action: RawAction | undefined, target: string): boolean {
  return !!action && isAddress(target) && action.to.toLowerCase() === (target as Address).toLowerCase();
}
