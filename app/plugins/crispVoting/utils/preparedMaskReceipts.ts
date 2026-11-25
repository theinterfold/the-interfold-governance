/** Only the current in-memory handoff: never persisted with the encrypted ballot. */
export type PreparedMaskReceipts = { scope: string; receipts: (string | null)[] };

export const preparedMaskScope = (roundId: bigint | undefined, voter: string | undefined) =>
  roundId !== undefined && voter ? `${roundId}:${voter.toLowerCase()}` : undefined;

export function appendPreparedMaskReceipt(
  current: PreparedMaskReceipts | null,
  scope: string,
  receipt: string | null
): PreparedMaskReceipts {
  return { scope, receipts: [...(current?.scope === scope ? current.receipts : []), receipt] };
}

export const preparedMaskReceiptsFor = (current: PreparedMaskReceipts | null, scope: string | undefined) =>
  current && current.scope === scope ? current.receipts : [];
