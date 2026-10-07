const ASSET_ROOT = "/govern-light/entrance-moving-439a65ba9b0355bf";
const DISPLAY_DELAY = 1.3;
const MODEL_FRAME_LAG = 0.1;
const FRAME_SLOTS = 16;
const CLOCK_RATE = 2.6;
const ENTRANCE_DURATION = 1.2;
const DISPLAY_START = 0.5;
const WARMUP_TIME = DISPLAY_START + DISPLAY_DELAY + MODEL_FRAME_LAG;
const ENTRANCE_RISE_DURATION = 600;

/** Fixed Leve / Mais movimento preset shared with the approved local study.
 * Simulation runs in a worker; the main thread interpolates individual circles.
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} reducedMotion
 * @param {{signal?: AbortSignal, onError?: (error: Error) => void, animateEntrance?: boolean}} options
 * @returns {Promise<{render: (time: number) => void, resize: () => void, dispose: () => void}>}
 */
export async function createGovernHero(canvas, reducedMotion = false, { signal, onError, animateEntrance = true } = {}) {
  const abortError = () => new DOMException("Artwork initialization cancelled", "AbortError");
  if (signal?.aborted) throw abortError();
  const { createGrainRenderer } = await import(/* webpackIgnore: true */ `${ASSET_ROOT}/renderer.js`);
  if (signal?.aborted) throw abortError();
  const worker = new Worker(`${ASSET_ROOT}/worker.js`, { type: "module" });
  let renderer = null, disposed = false, ready = false, busy = false, spare = null;
  let entranceRise = null;
  let frames = [], frameStart = 0, frameCount = 0, version = 0;
  let time = reducedMotion ? 0 : DISPLAY_START + DISPLAY_DELAY;
  let lastRequest = 0, lastSentAt = -Infinity, lastDraw = -Infinity, width = 0, height = 0;
  // Reveal the real circles once. Simulation time, point positions and radii
  // continue unchanged; reduced motion and a paused recovery draw fully.
  let entrance = reducedMotion || !animateEntrance ? 1 : 0;
  let resolveReady, rejectReady;
  const completion = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const timer = setTimeout(() => fail(new Error("Artwork initialization timed out")), 30000);
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    worker.terminate();
    entranceRise?.cancel();
    entranceRise = null;
    renderer?.dispose();
    frames = [];
    spare = null;
  }
  function abort() { if (!ready) rejectReady(abortError()); dispose(); }
  function fail(error) {
    canvas.dataset.failed = "true";
    if (!ready) rejectReady(error);
    else console.error("Govern artwork:", error);
    dispose();
    if (ready) onError?.(error);
  }
  function pushFrame(points, frameTime) {
    let index;
    if (frameCount) {
      const latest = frames[(frameStart + frameCount - 1) % FRAME_SLOTS];
      if (Math.abs(latest.time - frameTime) < 1e-8) {
        latest.points.set(points); latest.version = ++version; return;
      }
    }
    if (frameCount < FRAME_SLOTS) { index = (frameStart + frameCount) % FRAME_SLOTS; frameCount++; }
    else { index = frameStart; frameStart = (frameStart + 1) % FRAME_SLOTS; }
    const frame = frames[index]; frame.points.set(points); frame.time = frameTime; frame.version = ++version;
  }
  function draw() {
    if (!renderer || !frameCount || disposed || !width || !height) return;
    const target = Math.max(0, time - DISPLAY_DELAY);
    let lo = frames[frameStart], hi = lo;
    for (let n = 1; n < frameCount; n++) {
      const next = frames[(frameStart + n) % FRAME_SLOTS];
      if (target <= next.time) { hi = next; break; }
      lo = next; hi = next;
    }
    const alpha = hi.time > lo.time ? Math.max(0, Math.min(1, (target - lo.time) / (hi.time - lo.time))) : 0;
    renderer.drawInterpolated(lo, hi, alpha, 1, 0.65, entrance);
    canvas.dataset.entrance = entrance.toFixed(3);
    canvas.dataset.displayTime = (lo.time + (hi.time - lo.time) * alpha).toFixed(3);
  }
  function resize() {
    if (disposed || !renderer) return;
    const rect = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
    if (!w || !h) return;
    if (w !== width || h !== height) { width = w; height = h; renderer.resize(w, h); }
    draw();
  }
  function render(elapsed) {
    if (disposed || !ready) return;
    time = reducedMotion ? 0 : DISPLAY_START + DISPLAY_DELAY + Math.max(0, elapsed) * CLOCK_RATE;
    entrance = reducedMotion || !animateEntrance ? 1 : Math.min(1, Math.max(0, elapsed) / ENTRANCE_DURATION);
    if (entranceRise) {
      const riseTime = Math.max(0, elapsed) * 1000;
      if (riseTime < ENTRANCE_RISE_DURATION) entranceRise.currentTime = riseTime;
      else { entranceRise.cancel(); entranceRise = null; }
    }
    const now = performance.now();
    if (now + 0.3 >= lastDraw + 1000 / 60) { draw(); lastDraw = now; }
    if (!reducedMotion && time > lastRequest && !busy && spare && now - lastSentAt >= 32) {
      busy = true; lastRequest = time; lastSentAt = now;
      const buffer = spare; spare = null;
      worker.postMessage({ type: "sample", time, buffer }, [buffer]);
    }
  }
  function finishInitialization() {
    // Keep the canvas hidden until both the initial frame and its motion
    // neighbours exist. The reveal starts on the component's playback clock.
    clearTimeout(timer);
    if (!reducedMotion && animateEntrance) {
      // Match the site's ScrollFadeIn/LineReveal: 16px, 600ms, same easing.
      entranceRise = canvas.animate(
        [{ transform: "translate3d(0,16px,0)" }, { transform: "translate3d(0,0,0)" }],
        { duration: ENTRANCE_RISE_DURATION, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "both" }
      );
      entranceRise.pause();
      entranceRise.currentTime = 0;
    }
    resize();
    ready = true;
    resolveReady(api);
  }
  const api = { render, resize, dispose };
  signal?.addEventListener("abort", abort, { once: true });
  worker.onerror = event => fail(new Error(event.message || "Artwork worker failed"));
  worker.onmessage = ({ data }) => {
    if (disposed) return;
    if (data.type === "error") { fail(new Error(data.message)); return; }
    try {
      if (data.type === "ready") {
        if (data.count !== 60000) throw new Error("Unexpected Govern point profile");
        const points = new Float32Array(data.buffer);
        frames = Array.from({ length: FRAME_SLOTS }, () => ({ time: NaN, points: new Float32Array(points.length), version: 0 }));
        pushFrame(points, 0); spare = points.buffer;
        renderer = createGrainRenderer(canvas, data.count);
        canvas.dataset.profile = "light"; canvas.dataset.count = String(data.count);
        canvas.dataset.motionRevision = "entrance-moving-439a65ba9b0355bf";
        canvas.dataset.backend = data.backend || "cpu";
        canvas.dataset.pressureBackend = data.pressureBackend || "js-f64";
        canvas.dataset.whiteSize = "1";
        if (reducedMotion) finishInitialization();
        else {
          // Prepare the same exact solver path in advance, so the dots already
          // move while appearing rather than waiting for the display buffer.
          busy = true; lastRequest = WARMUP_TIME;
          const buffer = spare; spare = null;
          worker.postMessage({ type: "sample", time: WARMUP_TIME, buffer }, [buffer]);
        }
      } else if (data.type === "frame") {
        const points = new Float32Array(data.buffer);
        pushFrame(points, Math.max(0, data.time - MODEL_FRAME_LAG));
        if (data.partial) worker.postMessage({ type: "recycle", buffer: points.buffer }, [points.buffer]);
        else {
          busy = false; spare = points.buffer;
          canvas.dataset.sampleMs = data.sampleMs.toFixed(2);
          canvas.dataset.motionLag = Math.max(0, time - data.time).toFixed(3);
          if (!ready) finishInitialization();
        }
      }
    } catch (error) { fail(error); }
  };
  worker.postMessage({ type: "init" });
  return completion;
}
