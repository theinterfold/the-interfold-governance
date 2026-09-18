/**
 * Recovers the CRISP server's own rejection reason from a failed response.
 *
 * Every rejection path in `/voting/broadcast` sets a specific `message` — "Too many votes from
 * this address, slow down", "The vote commitment deadline has passed", "The availability service
 * is temporarily unavailable". That message is the only thing telling a voter whether to wait,
 * retry, or stop, so a flat "Failed to broadcast vote" is strictly worse than what the server
 * already said.
 *
 * Reading it is fallible in ways worth handling explicitly: the body may not be JSON (a proxy
 * error page, an empty 502), and `response.json()` throws on both. The status code is a poor
 * message on its own, so each of the shapes the relay actually returns gets its own sentence.
 */

/** Status codes the relay uses deliberately, with copy for when the body carries no message. */
const STATUS_FALLBACKS: Record<number, string> = {
  400: "The server rejected this vote as invalid.",
  409: "This vote conflicts with one already recorded for this round.",
  429: "Too many requests — wait a moment and try again.",
  503: "The voting service is temporarily unavailable. Try again shortly.",
  504: "The voting service timed out. Your vote was not recorded; try again.",
};

/**
 * @param response A non-2xx response from the CRISP server.
 * @returns The server's message when present, else a sentence derived from the status.
 */
export async function readServerRejection(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };
    // `message` is the relay's field; `error` is accepted too so a proxy or a future route that
    // uses the conventional name is not silently reduced to a status code.
    const stated = typeof body?.message === "string" ? body.message : undefined;
    const alternate = typeof body?.error === "string" ? body.error : undefined;
    const text = (stated ?? alternate)?.trim();
    if (text) return text;
  } catch {
    // Not JSON — a proxy error page or an empty body. Fall through to the status.
  }

  return STATUS_FALLBACKS[response.status] ?? `The server rejected this vote (HTTP ${response.status}).`;
}
