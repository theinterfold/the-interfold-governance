/*
 * Staging a ciphertext with the CRISP server can be refused because the server has not read the voter's staging key
 * (the root of the pass) from Aztec yet. The server checks the root BEFORE it takes the pass's tag, so that refusal
 * costs nothing: the same request can be sent again. A tag the server has already taken means the pass was used, and only
 * a pass with the next counter can stage. Every other refusal is final.
 *
 * The messages are the server's (`staging_pass.rs`: `UNKNOWN_ROOT`, `TAG_USED`), which answers 400 with them in the body;
 * the SDK's `stageInput` reports them as `CRISP server input staging failed (400): <body>`.
 */
const UNKNOWN_ROOT = "The staging pass names a census root this round has not had";
const TAG_USED = "The staging pass was already used";

/** Whether the error `stageInput` threw says the pass's tag was already used. */
export const isTagUsed = (error: unknown): boolean => error instanceof Error && error.message.includes(TAG_USED);

const RETRY_WINDOW_MS = 3 * 60_000;
const FIRST_DELAY_MS = 3_000;
const MAX_DELAY_MS = 15_000;

/**
 * A `fetch` that resends a request the server refused for an unknown root, with the same body, until the server accepts it
 * or the retry window ends; every other answer is returned as it is, for the caller to read. Backoff doubles from 3 s to
 * 15 s and never runs past the window. `onWait` reports each wait.
 */
export const retryingStagingFetch = (
  send: typeof fetch,
  onWait: (retry: number, delayMs: number) => void,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
): typeof fetch => {
  const retrying = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    for (let attempt = 0, waited = 0; ; attempt++) {
      const response = await send(input, init);
      const remaining = RETRY_WINDOW_MS - waited;
      if (response.status !== 400 || remaining <= 0 || !(await response.clone().text()).includes(UNKNOWN_ROOT)) {
        return response;
      }
      const delay = Math.min(FIRST_DELAY_MS * 2 ** attempt, MAX_DELAY_MS, remaining);
      onWait(attempt + 1, delay);
      await sleep(delay);
      waited += delay;
    }
  };
  // Bun's typings give `fetch` a `preconnect` member that a wrapper has no use for.
  return retrying as typeof fetch;
};
