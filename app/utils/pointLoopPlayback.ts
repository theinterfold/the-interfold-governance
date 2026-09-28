import type { PointLoopLayer } from "./pointLoop";

/** Inline vector layers: only their HTML transforms/opacity animate. */
export async function createPointLoop(host: HTMLDivElement, layers: PointLoopLayer[], signal: AbortSignal) {
  const animations: Animation[] = [];
  const sheets: { element: HTMLDivElement; animation: Animation; duration: number }[] = [];
  let running = false;
  let disposed = false;
  let orderTimer: ReturnType<typeof setTimeout> | undefined;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(orderTimer);
    for (const animation of animations) animation.cancel();
    host.replaceChildren();
    signal.removeEventListener("abort", dispose);
  };
  signal.addEventListener("abort", dispose, { once: true });

  try {
    const mount = async (layer: PointLoopLayer, parent: HTMLElement, parentBounds = [0, 0, 600, 450]) => {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const element = document.createElement("div");
      element.className = "point-loop-layer";
      const [x, y, width, height] = layer.bounds;
      Object.assign(element.style, {
        left: `${(x - parentBounds[0]) / parentBounds[2] * 100}%`, top: `${(y - parentBounds[1]) / parentBounds[3] * 100}%`,
        width: `${width / parentBounds[2] * 100}%`, height: `${height / parentBounds[3] * 100}%`,
        transformOrigin: layer.origin,
        zIndex: layer.sheet ? "1" : "6",
      });
      // Markup is generated from validated local numeric coordinates in the worker.
      if (layer.markup) element.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${layer.bounds.join(" ")}" preserveAspectRatio="none" aria-hidden="true"><g fill="#121718">${layer.markup}</g></svg>`;
      parent.appendChild(element);
      if (layer.frames) {
        const animation = element.animate(layer.frames, {
          duration: layer.duration, iterations: Infinity, fill: "both",
        });
        animation.pause();
        animation.currentTime = layer.startTime;
        animations.push(animation);
        if (layer.sheet) sheets.push({ element, animation, duration: layer.duration });
      }
      // Give input and layout a turn between SVG parses, including on slow CPUs.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      for (const child of layer.children ?? []) await mount(child, element, layer.bounds);
    };
    for (const layer of layers) await mount(layer, host);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  } catch (error) {
    dispose();
    throw error;
  }

  const orderSheets = () => {
    clearTimeout(orderTimer);
    if (disposed || !sheets.length) return;
    const cycle = sheets[0].duration;
    const ordered = sheets.map((sheet) => ({
      ...sheet, life: (Number(sheet.animation.currentTime ?? 0) % cycle) / cycle,
    })).sort((a, b) => a.life - b.life);
    ordered.forEach(({ element }, i) => { element.style.zIndex = String(i + 1); });
    if (running) {
      // Reorder only when a sheet wraps, while it is transparent. No frame loop
      // and no animated masks are needed for the changing depth order.
      const nextWrap = Math.min(...ordered.map(({ life }) => (1 - life) * cycle));
      orderTimer = setTimeout(orderSheets, nextWrap + 20);
    }
  };
  orderSheets();

  return {
    pause() {
      running = false;
      clearTimeout(orderTimer);
      for (const animation of animations) animation.pause();
    },
    resume() {
      if (disposed || running) return;
      running = true;
      for (const animation of animations) animation.play();
      orderSheets();
    },
    dispose,
  };
}
