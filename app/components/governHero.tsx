import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Pause, Play } from "@phosphor-icons/react";
import styles from "./governHero.module.css";

type Renderer = {
  render: (timeSeconds: number) => void;
  resize: () => void;
  dispose: () => void;
};

export function GovernHeroArtwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pauseRef = useRef(false);
  const updatePlayback = useRef<(() => void) | null>(null);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    pauseRef.current = paused;
    updatePlayback.current?.();
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion === null) return;

    setReady(false);
    let renderer: Renderer | null = null;
    let disposed = false;
    let loading = false;
    let visible = false;
    let active = false;
    let loadToken = 0;
    let initialization: AbortController | null = null;
    let elapsed = 0;
    let previousTime = 0;
    let frame = 0;

    const stopInitialization = () => {
      loadToken++;
      initialization?.abort();
      initialization = null;
      loading = false;
    };

    const animate = (now: number) => {
      if (!active || !renderer) return;
      if (previousTime) elapsed += Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      renderer.render(elapsed);
      frame = requestAnimationFrame(animate);
    };

    const playback = () => {
      const next = Boolean(renderer) && !disposed && visible && !document.hidden && !pauseRef.current && !reducedMotion;
      if (active === next) return;
      active = next;
      previousTime = 0;
      if (active) frame = requestAnimationFrame(animate);
      else cancelAnimationFrame(frame);
    };

    const load = async () => {
      if (loading || renderer || disposed || !visible || document.hidden) return;
      loading = true;
      const token = ++loadToken;
      const controller = new AbortController();
      initialization = controller;
      try {
        const motionModule = await import("@/utils/governHeroRenderer");
        if (disposed || token !== loadToken || controller.signal.aborted) return;

        const created = await motionModule.createGovernHero(canvas, reducedMotion, {
          signal: controller.signal,
          animateEntrance: !pauseRef.current,
          onError: () => {
            active = false;
            cancelAnimationFrame(frame);
            renderer = null;
            if (!disposed) setReady(false);
          },
        });
        if (!created) return;
        if (disposed || token !== loadToken || controller.signal.aborted) {
          created.dispose();
          return;
        }

        renderer = created;
        renderer.resize();
        renderer.render(0);
        elapsed = 0;
        setReady(true);
        playback();
      } catch {
        if (token === loadToken) {
          renderer?.dispose();
          renderer = null;
        }
      } finally {
        if (token === loadToken) {
          loading = false;
          initialization = null;
        }
      }
    };

    const visibility = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) void load();
        else stopInitialization();
        playback();
      },
      { threshold: 0.05 }
    );
    const resize = new ResizeObserver(() => renderer?.resize());
    const documentVisibility = () => {
      if (document.hidden) stopInitialization();
      else if (visible) void load();
      playback();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      active = false;
      cancelAnimationFrame(frame);
      stopInitialization();
      renderer?.dispose();
      renderer = null;
      setReady(false);
    };
    const contextRestored = () => {
      if (visible && !document.hidden) void load();
    };

    visibility.observe(canvas);
    resize.observe(canvas);
    document.addEventListener("visibilitychange", documentVisibility);
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("webglcontextrestored", contextRestored);
    updatePlayback.current = playback;

    return () => {
      disposed = true;
      active = false;
      stopInitialization();
      cancelAnimationFrame(frame);
      visibility.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", documentVisibility);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      updatePlayback.current = null;
      renderer?.dispose();
      renderer = null;
    };
  }, [reducedMotion]);

  return (
    <>
      <div className={styles.art} data-ready={ready ? "true" : undefined} aria-hidden="true">
        <canvas ref={canvasRef} />
      </div>
      {ready && !reducedMotion && (
        <button
          type="button"
          className={styles.motion}
          aria-label={paused ? "Play motion" : "Pause motion"}
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play size={16} aria-hidden={true} /> : <Pause size={16} aria-hidden={true} />}
          <span>{paused ? "Play" : "Pause"}</span>
        </button>
      )}
    </>
  );
}
