import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import Router from "next/router";
import { flushSync } from "react-dom";
import { transitionPage } from "@/vendor/site-header/pageNavigation";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Next owns URLs and history. Keep the outgoing page mounted until its exit finishes. */
export function PageNavigation({ path, children }: { path: string; children: ReactNode }) {
  const [shown, setShown] = useState(path);
  const last = useRef(children);
  const outgoingScroll = useRef<{ left: number; top: number }>();
  const surface = useRef<HTMLDivElement>(null);
  const initialPlugin = shown === "/plugins/[id]" && path.startsWith("/plugins/");
  const current = shown === path || initialPlugin;

  useBrowserLayoutEffect(() => {
    if (current) last.current = children;
  }, [current, children]);

  useEffect(() => {
    const rememberScroll = () => {
      outgoingScroll.current = { left: window.scrollX, top: window.scrollY };
    };
    Router.events.on("beforeHistoryChange", rememberScroll);
    return () => Router.events.off("beforeHistoryChange", rememberScroll);
  }, []);

  // The animation lifetime follows navigation (including redirects), independent of rerenders.
  useBrowserLayoutEffect(() => {
    if (initialPlugin) {
      setShown(path);
      return;
    }
    if (shown === path) return;
    // Next has already positioned the destination. Keep the old reading position
    // through the exit, then apply the router's chosen position at the swap.
    const destination = { left: window.scrollX, top: window.scrollY };
    if (outgoingScroll.current) window.scrollTo({ ...outgoingScroll.current, behavior: "instant" });
    outgoingScroll.current = undefined;
    const controller = new AbortController();
    void transitionPage(() => surface.current, () => {
      flushSync(() => setShown(path));
      window.scrollTo({ ...destination, behavior: "instant" });
      document.getElementById("governance-content")?.focus({ preventScroll: true });
    }, controller.signal);
    return () => controller.abort();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={surface}>{current ? children : last.current}</div>;
}
