import { explainContractError } from "@/utils/explainContractError";

/**
 * Turns a thrown transaction error into something worth showing a user.
 *
 * Returns `undefined` for a declined signature: `useTransactionManager` already raises its own
 * alert for that, and it is a deliberate choice rather than a failure to report twice.
 *
 * A recognised custom error wins over the raw message. Without this the user sees a bare selector
 * like `0xf51125bb` — technically the truth, and useless. The raw message is kept as the fallback
 * so an unrecognised revert still surfaces rather than being flattened into a generic string.
 *
 * @param err The caught error.
 * @param fallback Message to use when the error carries nothing readable.
 */
export function describeFailure(err: unknown, fallback: string): string | undefined {
  const message = (err as { shortMessage?: string })?.shortMessage ?? (err as Error)?.message ?? fallback;

  if (/user rejected/i.test(message)) return undefined;

  const explained = explainContractError(err);
  if (explained) return `${explained.title}. ${explained.detail}`;

  return message;
}
