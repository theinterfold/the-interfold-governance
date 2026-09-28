import { parseUnits } from "viem";

/** Validate before parsing: parseUnits otherwise rounds excess fractional digits. */
export function feeDepositAmount(
  input: string,
  decimals?: number,
  balance?: bigint
): { amount?: bigint; error?: string } {
  const value = input.trim();
  if (!value) return {};
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return { error: "Enter a valid amount." };
  if (decimals === undefined) return {};
  if ((value.split(".")[1]?.length ?? 0) > decimals) {
    return { error: decimals === 0 ? "Enter a whole amount." : `Use up to ${decimals} decimal places.` };
  }
  const amount = parseUnits(value, decimals);
  if (amount <= 0n) return { error: "Enter an amount greater than zero." };
  if (balance === undefined) return {};
  if (amount > balance) return { error: "Amount exceeds your wallet balance." };
  return { amount };
}
