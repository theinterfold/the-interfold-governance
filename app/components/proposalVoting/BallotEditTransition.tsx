import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Retain the outgoing receipt while the same ballot surface opens the editing form. */
export function BallotEditTransition({ revision, layoutKey, children, ...props }: HTMLAttributes<HTMLDivElement> & {
  revision: number;
  layoutKey?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lastContent = useRef<ReactNode>(children);
  const [swap, setSwap] = useState<{ revision: number; active: number; previous: ReactNode }>({ revision, active: 0, previous: null });
  if (swap.revision !== revision) {
    setSwap({ revision, active: 1 - swap.active, previous: lastContent.current });
  }
  useClientLayoutEffect(() => { lastContent.current = children; }, [children]);
  useEffect(() => {
    if (!swap.previous) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : parseFloat(getComputedStyle(root.current!).getPropertyValue("--interfold-ui-duration")) || 360;
    const timer = window.setTimeout(() => {
      const element = root.current;
      const focused = document.activeElement;
      if (element && (focused === document.body || element.contains(focused))) {
        element.querySelector<HTMLElement>(':scope > .motion-tab-panel[data-state="active"] :is(input,button):not(:disabled)')?.focus({ preventScroll: true });
      }
      setSwap(current => current.revision === revision ? { ...current, previous: null } : current);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [swap.revision, swap.previous, revision]);
  return <FluidHeight {...props} layoutKey={`${revision}:${layoutKey ?? ""}`}>
    <div ref={root} className="motion-tab-panels ballot-edit-transition">
      {[0, 1].map(slot => <MotionPanel key={slot} active={swap.active === slot} direction={swap.active === slot ? "left" : "right"}>
        {swap.active === slot ? children : swap.previous}
      </MotionPanel>)}
    </div>
  </FluidHeight>;
}
