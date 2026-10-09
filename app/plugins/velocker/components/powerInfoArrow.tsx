import { forwardRef, type SVGProps } from "react";

/** Overlap the surface border so the pointer and bubble have one continuous outline. */
export const PowerInfoArrow = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(function PowerInfoArrow(props, ref) {
  return (
    <svg {...props} ref={ref} viewBox="0 0 14 7" aria-hidden="true">
      <path d="M0 -2H14V0L7 7L0 0Z" fill="var(--paper)" />
      <path d="M0 0L7 7L14 0" fill="none" stroke="var(--rule)" strokeWidth="1" />
    </svg>
  );
});
