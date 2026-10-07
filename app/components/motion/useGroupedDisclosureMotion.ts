import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
type Position = { rect: DOMRect; summaryOpacity: number; itemOpacity: number };
type Flight = { element: HTMLElement; summary: HTMLElement; item: HTMLElement; animations: Animation[] };

/** Split grouped summaries into their items, and merge them again when a disclosure closes. */
export function useGroupedDisclosureMotion(open: boolean) {
  const ref = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, Position> | null>(null);
  const flights = useRef(new Map<string, Flight>());
  const generation = useRef(0);

  const cancel = useCallback(() => {
    generation.current += 1;
    flights.current.forEach(({ element, animations }) => {
      animations.forEach((animation) => animation.cancel());
      element.remove();
    });
    flights.current.clear();
    ref.current?.removeAttribute("data-group-motion");
  }, []);

  const prepare = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    const summaries = new Map(
      Array.from(root.querySelectorAll<HTMLElement>("[data-motion-summary]"), (element) => [
        element.dataset.motionSummary,
        element,
      ])
    );
    const positions = new Map<string, Position>();
    root.querySelectorAll<HTMLElement>("[data-motion-item]").forEach((item) => {
      const id = item.dataset.motionItem!;
      const flight = flights.current.get(id);
      const source = flight?.element ?? (open ? item : summaryFor(item, summaries));
      if (source) {
        positions.set(id, {
          rect: source.getBoundingClientRect(),
          summaryOpacity: flight ? Number(getComputedStyle(flight.summary).opacity) : open ? 0 : 1,
          itemOpacity: flight ? Number(getComputedStyle(flight.item).opacity) : open ? 1 : 0,
        });
      }
    });
    before.current = positions;
    cancel();
  }, [open, cancel]);

  useClientLayoutEffect(() => {
    const positions = before.current;
    before.current = null;
    const root = ref.current;
    const overlay = overlayRef.current;
    if (
      !positions?.size ||
      !root ||
      !overlay ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof overlay.animate !== "function"
    )
      return;

    const styles = getComputedStyle(root);
    const durationToken = styles.getPropertyValue("--interfold-ui-duration").trim();
    const parsedDuration = parseFloat(durationToken) * (durationToken.endsWith("ms") ? 1 : 1000);
    const duration = Number.isFinite(parsedDuration) ? parsedDuration : 560;
    const easing = styles.getPropertyValue("--interfold-ui-ease").trim() || "ease-out";
    const origin = root.getBoundingClientRect();
    const frame = (rect: DOMRect) => ({
      transform: `translate(${rect.left - origin.left - root.clientLeft}px, ${rect.top - origin.top - root.clientTop}px)`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    const summaries = new Map(
      Array.from(root.querySelectorAll<HTMLElement>("[data-motion-summary]"), (element) => [
        element.dataset.motionSummary,
        element,
      ])
    );
    const run = generation.current;
    const finished: Promise<Animation>[] = [];
    // Expanded summaries leave the header's flow. Aim at the rows' final
    // position while FluidHeight contracts the header, so badges land in place.
    const heading = root.querySelector<HTMLElement>(".power-disclosure-heading-surface");
    const headingContent = heading?.querySelector<HTMLElement>(".fluid-height-content");
    const headingShift =
      open && heading && headingContent ? headingContent.offsetHeight - heading.getBoundingClientRect().height : 0;

    root.querySelectorAll<HTMLElement>("[data-motion-item]").forEach((item) => {
      const id = item.dataset.motionItem!;
      const first = positions.get(id);
      const summary = summaryFor(item, summaries);
      if (!first || !summary) return;
      // Keep flying copies outside the clipping body; real badges remain the accessible content.
      const element = document.createElement("div");
      element.className = "grouped-motion-flight";
      element.dataset.flightItem = id;
      const summaryCopy = cloneBadge(summary);
      const itemCopy = cloneBadge(item);
      element.append(summaryCopy, itemCopy);
      overlay.append(element);
      const target = (open ? item : summary).getBoundingClientRect();
      const destination = new DOMRect(target.x, target.y + headingShift, target.width, target.height);
      const travel = element.animate([frame(first.rect), frame(destination)], { duration, easing, fill: "both" });
      const labels = [summaryCopy, itemCopy].map((copy, index) => {
        const start = index ? first.itemOpacity : first.summaryOpacity;
        const incoming = index ? open : !open;
        // Exchange the labels in sequence so a grouped count never overlaps a row label.
        const frames = incoming
          ? [
              { opacity: start },
              { opacity: 0, offset: open ? 0.18 : 0.6 },
              { opacity: 1, offset: open ? 0.42 : 0.86 },
              { opacity: 1 },
            ]
          : [{ opacity: start }, { opacity: 0, offset: open ? 0.16 : 0.58 }, { opacity: 0 }];
        return copy.animate(frames, { duration, easing: "linear", fill: "both" });
      });
      flights.current.set(id, { element, summary: summaryCopy, item: itemCopy, animations: [travel, ...labels] });
      finished.push(travel.finished);
    });
    if (finished.length) {
      root.setAttribute("data-group-motion", "true");
      void Promise.all(finished).then(
        () => {
          if (generation.current === run) cancel();
        },
        () => {
          /* A reversed transition owns the new flights. */
        }
      );
    }
  }, [open, cancel]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (preference.matches) cancel();
    };
    preference.addEventListener("change", stop);
    window.addEventListener("resize", cancel);
    return () => {
      preference.removeEventListener("change", stop);
      window.removeEventListener("resize", cancel);
      cancel();
    };
  }, [cancel]);

  return { ref, overlayRef, prepare };
}

function summaryFor(item: HTMLElement, summaries: Map<string | undefined, HTMLElement>) {
  return summaries.get(item.dataset.motionItem) ?? summaries.get(item.dataset.motionGroup) ?? summaries.get("overflow");
}

function cloneBadge(source: HTMLElement) {
  const copy = source.cloneNode(true) as HTMLElement;
  const styles = getComputedStyle(source);
  // Counts may be taller than row badges; preserve each endpoint's typography outside its parent.
  Object.assign(copy.style, {
    font: styles.font,
    padding: styles.padding,
    borderRadius: styles.borderRadius,
    gap: styles.gap,
    alignItems: styles.alignItems,
    justifyContent: styles.justifyContent,
  });
  copy.removeAttribute("id");
  copy.removeAttribute("data-motion-summary");
  copy.removeAttribute("data-motion-item");
  copy.removeAttribute("data-motion-group");
  return copy;
}
