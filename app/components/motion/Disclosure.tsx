import type { HTMLAttributes } from "react";
import { useInert } from "./useInert";

/** Keep content mounted so reversing a disclosure preserves its controls and state. */
export function Disclosure({
  open,
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { open: boolean }) {
  const ref = useInert(!open);
  return (
    <div {...props} ref={ref} className={`motion-disclosure ${className}`} data-open={open} aria-hidden={!open}>
      <div className="motion-disclosure-clip">{children}</div>
    </div>
  );
}
