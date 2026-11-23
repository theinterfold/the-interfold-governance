/*
 * Staging a ciphertext with the CRISP server can be refused because the server has not read the voter's staging key
 * (the root of the pass) from Aztec yet. The server checks the root BEFORE it takes the pass's tag, so that refusal
 * costs nothing: the same request can be sent again. A tag the server has already taken means the pass was used, and only
 * a pass with the next counter can stage. Every other refusal is final.
 *
 * The messages are the server's (`staging_pass.rs`: `UNKNOWN_ROOT`, `TAG_USED`), which answers 400 with them in the body;
 * the SDK's `stageInput` reports them as `CRISP server input staging failed (400): <body>`.
 */
export const UNKNOWN_ROOT = "The staging pass names a census root this round has not had";
export const TAG_USED = "The staging pass was already used";

export type StagingAnswer = "accepted" | "unknown-root" | "tag-used" | "refused";

/** What the server's answer to a staging request means. */
export const classifyStagingAnswer = (status: number, body: string): StagingAnswer => {
  if (status >= 200 && status < 300) return "accepted";
  if (status === 400 && body.includes(UNKNOWN_ROOT)) return "unknown-root";
  if (status === 400 && body.includes(TAG_USED)) return "tag-used";
  return "refused";
};

/** The same, for the error `stageInput` throws. */
export const classifyStagingError = (error: unknown): StagingAnswer =>
  error instanceof Error && error.message.includes("(400)") ? classifyStagingAnswer(400, error.message) : "refused";

/** How long a pass is retried for a root the server has not seen. */
export const STAGING_RETRY_WINDOW_MS = 3 * 60_000;
const FIRST_DELAY_MS = 3_000;
const MAX_DELAY_MS = 15_000;

export type StagingStep =
  | { kind: "accept" }
  /** Send the same request again after `delayMs`: the tag is untouched. */
  | { kind: "retry-same-pass"; delayMs: number }
  /** The pass is spent: count it and build one with the next counter. */
  | { kind: "next-counter" }
  | { kind: "stop" };

/**
 * What to do with an answer, `attempt` being the retries made so far (from 0) and `elapsedMs` the time since the first try.
 * Backoff doubles from 3 s to 15 s and never runs past the retry window.
 */
export const nextStagingStep = (answer: StagingAnswer, attempt: number, elapsedMs: number): StagingStep => {
  switch (answer) {
    case "accepted":
      return { kind: "accept" };
    case "tag-used":
      return { kind: "next-counter" };
    case "unknown-root": {
      const remaining = STAGING_RETRY_WINDOW_MS - elapsedMs;
      if (remaining <= 0) return { kind: "stop" };
      return { kind: "retry-same-pass", delayMs: Math.min(FIRST_DELAY_MS * 2 ** attempt, MAX_DELAY_MS, remaining) };
    }
    case "refused":
      return { kind: "stop" };
  }
};

/**
 * A `fetch` that resends a request the server refused for an unknown root, with the same body, until the server accepts it
 * or the window ends; every other answer is returned as it is, for the caller to read. `onWait` reports each wait.
 */
export const retryingStagingFetch = (
  send: typeof fetch,
  options: {
    onWait: (retry: number, delayMs: number) => void;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  }
): typeof fetch => {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const retrying = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const started = now();
    for (let attempt = 0; ; attempt++) {
      const response = await send(input, init);
      const answer = response.ok ? "accepted" : classifyStagingAnswer(response.status, await response.clone().text());
      const step = nextStagingStep(answer, attempt, now() - started);
      if (step.kind !== "retry-same-pass") return response;
      options.onWait(attempt + 1, step.delayMs);
      await sleep(step.delayMs);
    }
  };
  // Bun's typings give `fetch` a `preconnect` member that a wrapper has no use for.
  return retrying as typeof fetch;
};
