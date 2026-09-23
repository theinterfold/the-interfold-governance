import { parseEther } from "viem";

/** Empty optional amounts mean zero; unfinished input must never throw or keep an old action. */
export function parseActionValue(input: string, optional = false): bigint | null {
  const value = input.trim();
  if (!value) return optional ? 0n : null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  try {
    return parseEther(value);
  } catch {
    return null;
  }
}
