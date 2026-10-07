import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { POINT_ASSET_VERSION, type PointIllustrationName, type PointLoopLayer } from "@/utils/pointLoop";
import { createPointLoop } from "@/utils/pointLoopPlayback";

type Props = {
  image: PointIllustrationName;
  animated?: boolean;
  paused?: boolean;
  onAnimationReady?: (ready: boolean) => void;
};

function prepareLayers(buffer: ArrayBuffer, image: PointIllustrationName, signal: AbortSignal) {
  return new Promise<PointLoopLayer[]>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const worker = new Worker(new URL("../utils/pointLoop.worker.ts", import.meta.url));
    const finish = () => { worker.terminate(); signal.removeEventListener("abort", cancel); };
    const cancel = () => { finish(); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ layers?: PointLoopLayer[]; error?: string }>) => {
      finish();
      if (data.layers) resolve(data.layers);
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => { event.preventDefault(); finish(); reject(new Error("Could not prepare illustration")); };
    worker.postMessage({ buffer, image }, [buffer]);
  });
}

/** Vector poster enhanced into composited layers of inline SVG points. */
export function PointIllustration({ image, animated = false, paused = false, onAnimationReady }: Props) {
  const loopRef = useRef<HTMLDivElement>(null);
  const pauseRef = useRef(paused);
  const updatePlayback = useRef<(() => void) | null>(null);
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    pauseRef.current = paused;
    updatePlayback.current?.();
  }, [paused]);

  useEffect(() => {
    setReady(false);
    onAnimationReady?.(false);
    const host = loopRef.current;
    if (!host || !animated || reducedMotion !== false || typeof Worker === "undefined" || !host.animate) return;
    const abort = new AbortController();
    let disposed = false;
    let visible = false;
    let loading = false;
    let renderer: Awaited<ReturnType<typeof createPointLoop>> | null = null;

    const playback = () => {
      if (!renderer) return;
      if (!visible || document.hidden || pauseRef.current) renderer.pause();
      else renderer.resume();
    };
    const load = async () => {
      if (loading || renderer || disposed || document.hidden) return;
      loading = true;
      try {
        const response = await fetch(`/images/${image}-dots.points?v=${POINT_ASSET_VERSION}`, { signal: abort.signal });
        if (!response.ok) throw new Error("Could not load illustration coordinates");
        const buffer = await response.arrayBuffer();
        if (disposed) return;
        const layers = await prepareLayers(buffer, image, abort.signal);
        renderer = await createPointLoop(host, layers, abort.signal);
        if (disposed) { renderer.dispose(); return; }
        setReady(true);
        onAnimationReady?.(true);
        playback();
      } catch {
        renderer?.dispose();
        renderer = null;
        // Loading failures retain the vector poster.
      }
    };
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= .1;
      if (visible) void load();
      playback();
    }, { threshold: [0, .1] });
    visibility.observe(host);
    updatePlayback.current = playback;
    const documentVisibility = () => { if (visible) void load(); playback(); };
    document.addEventListener("visibilitychange", documentVisibility);
    return () => {
      disposed = true;
      abort.abort();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", documentVisibility);
      updatePlayback.current = null;
      renderer?.dispose();
    };
  }, [image, animated, reducedMotion, onAnimationReady]);

  return (
    <div className="point-illustration" data-ready={ready ? "true" : undefined}>
      {/* The SVG poster also covers no-JS and reduced motion. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!ready && <img src={`/images/${image}-dots.svg?v=${POINT_ASSET_VERSION}`} alt="" width={900} height={678} loading="lazy" decoding="async" />}
      {animated && <div ref={loopRef} className="point-loop" aria-hidden="true" />}
    </div>
  );
}
