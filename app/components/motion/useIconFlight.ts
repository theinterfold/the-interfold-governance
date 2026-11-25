import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Where one icon starts: a copy of it, its box and its colour. */
interface Departure {
  id: string;
  rect: DOMRect;
  copy: SVGElement;
  color: string;
  opacity: string;
}

interface Flight {
  copies: SVGElement[];
  animations: Animation[];
}

interface SizeDeparture {
  element: HTMLElement;
  height: number;
  opacity: string;
}

interface FadeDeparture {
  element: HTMLElement;
  opacity: string;
}

interface PendingFlight {
  open: boolean;
  from: Departure[];
  sizes: SizeDeparture[];
  fades: FadeDeparture[];
  reversing: boolean;
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
 * lands the icons at once. Optional `data-flight-size` regions share the same timeline;
 * use `disclosure` for a clipping region that also fades. A reversal starts at the current frame.
 * `data-flight-fade="closed"` keeps control surfaces painted separately from travelling icons.
 * `data-flight-opacity` carries the icon's resting opacity, including disabled controls.
 */
export function useIconFlight(open: boolean) {
  const ref = useRef<HTMLElement>(null);
  const departures = useRef<PendingFlight | null>(null);
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
          const moving = flying?.find((copy) => copy.dataset.flightIcon === id);
          const source = moving ?? element.querySelector("svg");
          if (!id || !source) return [];
          const rect = source.getBoundingClientRect();
          return [{ id, rect, copy: source.cloneNode(true) as SVGElement, color: getComputedStyle(source).color,
            opacity: moving ? getComputedStyle(moving).opacity : element.dataset.flightOpacity ?? "1" }];
        }
      );
      const sizes = Array.from(root.querySelectorAll<HTMLElement>("[data-flight-size]")).map((element) => ({
        element,
        height: element.getBoundingClientRect().height,
        opacity: getComputedStyle(element).opacity,
      }));
      const fades = Array.from(root.querySelectorAll<HTMLElement>("[data-flight-fade]")).map((element) => ({
        element, opacity: getComputedStyle(element).opacity,
      }));
      land();
      departures.current = { open: nextOpen, from, sizes, fades, reversing: flying !== undefined };
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
    // Measure the destination before any height effect changes its layout. CSS transitions
    // are suspended by data-icon-flight, so these are the final, natural boxes.
    const sizes = pending.sizes.map((departure) => ({
      ...departure,
      endHeight: departure.element.getBoundingClientRect().height,
    }));
    for (const { id, rect, copy, color, opacity } of pending.from) {
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
        opacity,
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
            { transform: "translate(0, 0) scale(1, 1)", color, opacity },
            {
              transform: `translate(${end.left - rect.left}px, ${end.top - rect.top}px) scale(${end.width / rect.width}, ${end.height / rect.height})`,
              color: getComputedStyle(target).color,
              opacity: target.closest<HTMLElement>("[data-flight-icon]")?.dataset.flightOpacity ?? "1",
            },
          ],
          { duration, easing, fill: "forwards" }
        )
      );
    }
    for (const { element, opacity } of pending.fades) {
      const appearing = element.dataset.flightFade === place(open);
      // The shells return as the glyphs approach, and are fully painted before landing.
      // Retain the current paint on reversals instead of reapplying the entrance delay.
      animations.push(element.animate(
        [{ opacity, visibility: "visible" }, { opacity: appearing ? "1" : "0", visibility: "visible" }],
        { duration: 180, delay: appearing && !pending.reversing ? Math.max(0, duration - 180) : 0,
          easing: "ease", fill: "both" }
      ));
    }
    for (const { element, height, endHeight, opacity } of sizes) {
      const disclosure = element.dataset.flightSize === "disclosure";
      // Keep the grid's content laid out while its single clipping region contracts.
      // The underlying closed state is revealed only after the shared flight lands.
      const content = disclosure ? { gridTemplateRows: "1fr", visibility: "visible" } : {};
      animations.push(
        element.animate(
          [
            { height: `${height}px`, ...content },
            { height: `${endHeight}px`, ...content },
          ],
          { duration, easing, fill: "both" }
        )
      );
      if (disclosure) {
        // As in step transitions, let shared elements travel before new text enters.
        // A reversal retains the current opacity instead of restarting from invisible.
        animations.push(
          element.animate([{ opacity }, { opacity: open ? "1" : "0" }], {
            duration: 180,
            delay: open && !pending.reversing && Number(opacity) < 0.01 ? duration / 2 : 0,
            easing: "ease",
            fill: "both",
          })
        );
      }
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

  return { ref, prepare, finish: land };
}
