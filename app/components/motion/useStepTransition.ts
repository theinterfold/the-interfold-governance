import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
type Position = { x: number; y: number; height: number; fontSize: number; scale: number };
const visible = (element: HTMLElement) =>
  !element.closest('[aria-hidden="true"]') && element.getClientRects().length > 0;

/** Carry shared content to its next position; only genuinely new content fades in. */
export function useStepTransition(step: string, enabled: boolean) {
  const ref = useRef<HTMLFormElement>(null);
  const before = useRef<Map<string, Position>>();
  const excluded = useRef<string[]>([]);
  const animations = useRef<Animation[]>([]);
  const generation = useRef(0);

  const cancel = useCallback(() => {
    generation.current += 1;
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    ref.current?.removeAttribute("data-step-moving");
  }, []);

  const prepare = useCallback(
    (excludeKeys: string[] = []) => {
      const root = ref.current;
      if (!root) return;
      const origin = root.getBoundingClientRect();
      const positions = new Map<string, Position>();
      root.querySelectorAll<HTMLElement>("[data-step-key]").forEach((element) => {
        if (!visible(element)) return;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        positions.set(element.dataset.stepKey!, {
          x: rect.left - origin.left,
          y: rect.top - origin.top,
          height: rect.height,
          fontSize: parseFloat(style.fontSize),
          scale: parseFloat(style.scale) || 1,
        });
      });
      before.current = positions;
      excluded.current = excludeKeys;
      // Read the current visual positions before cancelling an interrupted transition.
      cancel();
    },
    [cancel]
  );

  useClientLayoutEffect(() => {
    const root = ref.current;
    const positions = before.current;
    before.current = undefined;
    if (!enabled) {
      // Keep the outgoing step exactly as it looked when a picker or closing morph interrupted it.
      animations.current.forEach((animation) => animation.pause());
      return;
    }
    if (!root || !positions || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cancel();
      return;
    }
    if (root.closest("[data-morphing]") || typeof root.animate !== "function") return;

    const run = generation.current;
    const origin = root.getBoundingClientRect();
    const styles = getComputedStyle(root);
    const duration = parseFloat(styles.getPropertyValue("--lock-step-duration")) || 360;
    const easing = "cubic-bezier(.2,.8,.2,1)";
    root.setAttribute("data-step-moving", "true");

    root.querySelectorAll<HTMLElement>("[data-step-key]").forEach((element) => {
      if (!visible(element) || excluded.current.includes(element.dataset.stepKey!)) return;
      const first = positions.get(element.dataset.stepKey!);
      const rect = element.getBoundingClientRect();
      if (element.hasAttribute("data-step-surface")) {
        // Resize the background alone: the content and final layout keep their own geometry.
        if (!first || Math.abs(first.height - rect.height) < 0.5) return;
        const animation = element.animate([{ height: `${first.height}px` }, { height: `${rect.height}px` }], {
          duration,
          easing,
          fill: "both",
        });
        animation.id = `lock-step-${element.dataset.stepKey}`;
        animations.current.push(animation);
        return;
      }
      const x = first ? first.x - (rect.left - origin.left) : 0;
      const y = first ? first.y - (rect.top - origin.top) : 8;
      const scale = first ? (first.fontSize * first.scale) / parseFloat(getComputedStyle(element).fontSize) : 1;
      if (first && Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(scale - 1) < 0.01) return;
      const animation = element.animate(
        [
          { left: `${x}px`, top: `${y}px`, scale: `${scale}`, opacity: first ? 1 : 0, transformOrigin: "top left" },
          { left: "0px", top: "0px", scale: "1", opacity: 1, transformOrigin: "top left" },
        ],
        { duration: first ? duration : 180, delay: first ? 0 : duration / 2, easing, fill: "both" }
      );
      animation.id = `lock-step-${element.dataset.stepKey}`;
      animations.current.push(animation);
    });
    void Promise.allSettled(animations.current.map((animation) => animation.finished)).then(() => {
      if (run === generation.current) cancel();
    });
  }, [step, enabled, cancel]);

  useEffect(() => {
    const settle = () => {
      before.current = undefined;
      cancel();
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("resize", settle);
    reducedMotion.addEventListener("change", settle);
    return () => {
      window.removeEventListener("resize", settle);
      reducedMotion.removeEventListener("change", settle);
      cancel();
    };
  }, [cancel]);

  return { ref, prepare };
}
