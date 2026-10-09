import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Where one icon starts: a copy of it, its box and its colour. */
interface Departure {
  id: string;
  rect: DOMRect;
  copy: SVGElement;
  color: string;
}

interface Flight {
  copies: SVGElement[];
  animations: Animation[];
}

const place = (open: boolean) => (open ? "open" : "closed");

/**
 * Carry icons between the two places of a group's controls as the group opens or closes, so each
 * icon keeps its identity through the change.
 *
 * Mark the element around each icon with `data-flight-icon` (an id shared by both places) and
 * `data-flight-place` (`open` or `closed`). Put `ref` on the group, and call `prepare(nextOpen)`
 * just before `open` changes. Copies fly above every clipping container while the group carries
 * `data-icon-flight`, the cue to hide the real icons. A scroll, a resize or a reduced-motion change
 * lands the icons at once. A reversed flight starts where its copies are.
 */
export function useIconFlight(open: boolean) {
  const ref = useRef<HTMLElement>(null);
  const departures = useRef<{ open: boolean; from: Departure[] } | null>(null);
  const flight = useRef<Flight | null>(null);

  const land = useCallback(() => {
    flight.current?.animations.forEach((animation) => animation.cancel());
    flight.current?.copies.forEach((copy) => copy.remove());
    flight.current = null;
    ref.current?.removeAttribute("data-icon-flight");
  }, []);

  const prepare = useCallback(
    (nextOpen: boolean) => {
      const root = ref.current;
      departures.current = null;
      if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        land();
        return;
      }
      const flying = flight.current?.copies;
      const from = Array.from(root.querySelectorAll<HTMLElement>(`[data-flight-place="${place(!nextOpen)}"]`)).flatMap(
        (element): Departure[] => {
          const id = element.dataset.flightIcon;
          const source = flying?.find((copy) => copy.dataset.flightIcon === id) ?? element.querySelector("svg");
          if (!id || !source) return [];
          const rect = source.getBoundingClientRect();
          return [{ id, rect, copy: source.cloneNode(true) as SVGElement, color: getComputedStyle(source).color }];
        }
      );
      land();
      departures.current = { open: nextOpen, from };
      root.setAttribute("data-icon-flight", "true");
    },
    [land]
  );

  useClientLayoutEffect(() => {
    const pending = departures.current;
    const root = ref.current;
    if (!pending || pending.open !== open || !root) return;
    departures.current = null;
    const style = getComputedStyle(root);
    const token = style.getPropertyValue("--interfold-ui-duration").trim();
    const duration = (parseFloat(token) || 320) * (token.endsWith("s") && !token.endsWith("ms") ? 1000 : 1);
    const easing = style.getPropertyValue("--interfold-ui-ease").trim() || "cubic-bezier(0.22, 1, 0.36, 1)";
    const copies: SVGElement[] = [];
    const animations: Animation[] = [];
    for (const { id, rect, copy, color } of pending.from) {
      const target = root.querySelector<SVGElement>(
        `[data-flight-icon="${id}"][data-flight-place="${place(open)}"] svg`
      );
      const end = target?.getBoundingClientRect();
      if (!target || !end?.width || !end.height || !rect.width || !rect.height) continue;
      copy.dataset.flightIcon = id;
      copy.setAttribute("aria-hidden", "true");
      Object.assign(copy.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: "0",
        color,
        pointerEvents: "none",
        zIndex: "40",
        transform: "none",
        transformOrigin: "0 0",
      });
      document.body.append(copy);
      copies.push(copy);
      animations.push(
        copy.animate(
          [
            { transform: "translate(0, 0) scale(1, 1)", color },
            {
              transform: `translate(${end.left - rect.left}px, ${end.top - rect.top}px) scale(${end.width / rect.width}, ${end.height / rect.height})`,
              color: getComputedStyle(target).color,
            },
          ],
          { duration, easing, fill: "forwards" }
        )
      );
    }
    if (!animations.length) {
      root.removeAttribute("data-icon-flight");
      return;
    }
    const current = { copies, animations };
    flight.current = current;
    void Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
      if (flight.current === current) land();
    });
  }, [open, land]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Copies are fixed to the viewport: any scroll or resize would leave them behind.
    window.addEventListener("scroll", land, true);
    window.addEventListener("resize", land);
    reduced.addEventListener("change", land);
    return () => {
      window.removeEventListener("scroll", land, true);
      window.removeEventListener("resize", land);
      reduced.removeEventListener("change", land);
      land();
    };
  }, [land]);

  return { ref, prepare };
}
