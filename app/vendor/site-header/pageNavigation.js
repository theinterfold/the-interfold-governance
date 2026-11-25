// Shared by the website router, Governance and the static Dashboard adapter.
export async function transitionPage(getSurface, commit, signal) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let animation;
  const cancel = () => animation?.cancel();
  const skipMotion = () => {
    if (reduced.matches || document.hidden) cancel();
  };
  async function move(outgoing) {
    const surface = getSurface();
    if (!surface?.animate || reduced.matches || document.hidden || signal.aborted) return;
    const rest = { opacity: 1, transform: "none" };
    const frames = outgoing
      ? [rest, { opacity: 0, transform: "translateY(-18px)" }]
      : [{ opacity: 0, transform: "translateY(18px)" }, rest];
    animation = surface.animate(frames, {
      id: outgoing ? "interfold-page-out" : "interfold-page-in",
      duration: outgoing ? 220 : 280,
      easing: "cubic-bezier(0.55, 0, 0.1, 1)",
    });
    await animation.finished.catch(() => {});
  }
  signal.addEventListener("abort", cancel);
  reduced.addEventListener("change", skipMotion);
  document.addEventListener("visibilitychange", skipMotion);
  try {
    await move(true);
    if (signal.aborted) return;
    const committed = commit();
    await Promise.all([committed, move(false)]);
  } finally {
    signal.removeEventListener("abort", cancel);
    reduced.removeEventListener("change", skipMotion);
    document.removeEventListener("visibilitychange", skipMotion);
  }
}
