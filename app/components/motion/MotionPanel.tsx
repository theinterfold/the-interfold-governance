import type { ReactNode } from "react";
import { useInert } from "./useInert";

/** Inactive steps share the same slot without contributing to the measured height. */
export function MotionPanel({
  active,
  direction,
  children,
}: {
  active: boolean;
  direction: "left" | "right";
  children: ReactNode;
}) {
  const ref = useInert(!active);
  return (
    <div
      ref={ref}
      className="motion-tab-panel"
      data-state={active ? "active" : "inactive"}
      data-direction={direction}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}
