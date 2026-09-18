/**
 * Plain-English text for the custom errors this app can surface.
 *
 * A reverted contract call reaches the UI as a bare 4-byte selector — viem cannot name an error
 * that is not in the ABI it was given, and several of these are thrown by Interfold, the slashing
 * manager or the refund manager rather than by the contract the app called. The result is an alert
 * reading `0xf51125bb`, which tells the user nothing and cost real debugging time to decode by
 * hand.
 *
 * Selectors are the first four bytes of `keccak(signature)` and were verified with `cast sig`.
 * They are stable for a given signature, so a literal table is safe and needs no ABI at runtime.
 *
 * Only errors a USER can actually reach are listed. Deployment-time and operator-only failures
 * are deliberately absent: a table nobody can trigger is a maintenance cost, not a feature.
 */
type ErrorExplanation = {
  /** What went wrong, in the user's terms. */
  title: string;
  /** What they can do about it, when there is something. */
  detail: string;
};

const EXPLANATIONS: Record<string, ErrorExplanation> = {
  // --- refund settlement -------------------------------------------------------------------
  "0xf51125bb": {
    title: "The refund cannot be settled yet",
    detail:
      "Interfold holds the fee while a challenge against the round's committee can still be filed. Try again once that window closes.",
  },
  "0x05716e55": {
    title: "The refund has not been calculated yet",
    detail: "The round's failure must be recorded and settled on-chain before a refund can be claimed.",
  },
  "0x4f88ac02": {
    title: "There is no refund for this round",
    detail: "The distribution was calculated and left nothing owed to the fee payer.",
  },
  "0xa9214540": {
    title: "This refund was already claimed",
    detail: "The fee has been credited to the proposal's fee payer.",
  },
  "0x58ea1a27": {
    title: "Only the requester can claim this refund",
    detail: "The refund is paid to the account that requested the round, not to voters.",
  },

  // --- round lifecycle ---------------------------------------------------------------------
  "0xc2ddbfe4": {
    title: "Interfold is not accepting new rounds",
    detail: "Requests are paused on the protocol. This is an operator setting, not a problem with your proposal.",
  },
  "0xb381152f": {
    title: "The encryption parameters do not match the protocol",
    detail:
      "The plugin asked for a cryptographic configuration this Interfold deployment does not use. This needs an operator to reconcile the two.",
  },
  "0x01637967": {
    title: "Unsupported encryption parameters",
    detail: "This network does not permit the parameter set the plugin requested.",
  },
  "0x7bc2dc6a": {
    title: "This round is already marked as failed",
    detail: "Someone has already recorded the failure — continue with the remaining settlement steps.",
  },
  "0x4cc9c0f4": {
    title: "The voting window is outside the allowed range",
    detail: "The requested start or duration does not satisfy the round's minimum voting period.",
  },
  "0x59cec683": {
    title: "A challenge against the committee is still open",
    detail: "The round cannot be settled while an accusation can still be filed against a committee member.",
  },

  // --- token and balance -------------------------------------------------------------------
  "0x3f0c4e2d": {
    title: "Not enough unlocked balance",
    detail: "Some of your balance is locked. Free it, or use a smaller amount.",
  },
  "0xcede7487": {
    title: "This transfer is restricted",
    detail: "The token's transfer rules do not permit this movement between these accounts.",
  },
  "0xaba47339": {
    title: "This account is not registered",
    detail: "The action requires an account registered with the protocol.",
  },
};

/**
 * Matches a selector, whether bare or carrying ABI-encoded arguments.
 *
 * `\b` is wrong here: there is no word boundary between the selector and the encoded arguments
 * that follow it, so `0x3f0c4e2d0000…` would never match. Instead take the first four bytes of
 * any hex run and let the lookup decide — an 8-character run is a bare selector, a longer one is
 * a selector plus its arguments.
 */
const HEX_RUN_PATTERN = /0x([0-9a-fA-F]{8})[0-9a-fA-F]*/g;

/**
 * Finds a known custom error inside a thrown error and explains it.
 *
 * Searches the whole message rather than only its start: viem wraps the selector in surrounding
 * prose ("...reverted with the following signature: 0xf51125bb"), and the shape of that prose
 * differs between a simulation, a preflight and a mined-but-reverted receipt.
 *
 * @returns The explanation, or `undefined` when nothing recognisable is present.
 */
export function explainContractError(err: unknown): ErrorExplanation | undefined {
  const haystack = [
    (err as { shortMessage?: string })?.shortMessage,
    (err as { details?: string })?.details,
    (err as { data?: string })?.data,
    (err as Error)?.message,
    // Nested causes carry the revert data when the top-level message is generic.
    (err as { cause?: { data?: string; message?: string } })?.cause?.data,
    (err as { cause?: { data?: string; message?: string } })?.cause?.message,
  ]
    .filter(Boolean)
    .join(" ");

  if (!haystack) return undefined;

  for (const match of haystack.matchAll(HEX_RUN_PATTERN)) {
    const hit = EXPLANATIONS[`0x${match[1].toLowerCase()}`];
    if (hit) return hit;
  }

  return undefined;
}

/** The selectors this module can explain. Exported for tests. */
export const KNOWN_ERROR_SELECTORS = Object.keys(EXPLANATIONS);
