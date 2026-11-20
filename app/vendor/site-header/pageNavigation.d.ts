/** Commit the new route synchronously inside the callback, before its entrance is sampled. */
export function transitionPage(
  getSurface: () => HTMLElement | null,
  commit: () => void | Promise<void>,
  signal: AbortSignal
): Promise<void>;
