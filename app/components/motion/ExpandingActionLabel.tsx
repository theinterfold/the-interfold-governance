import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Keep the common words in place while a trailing phrase makes room beside them. */
export function ExpandingActionLabel({
  children,
  suffix,
  expanded,
}: {
  children: ReactNode;
  suffix: string;
  expanded: boolean;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [suffixWidth, setSuffixWidth] = useState(0);

  useClientLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure) return;
    // Layout width stays stable while the surrounding dialog is morphing.
    const update = () => setSuffixWidth(measure.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [suffix]);

  return (
    <span className="expanding-action-label">
      <span className="expanding-action-base">{children}</span>
      <span
        className="expanding-action-suffix"
        data-expanded={expanded}
        aria-hidden={!expanded}
        style={{ width: expanded ? suffixWidth : 0 }}
      >
        <span ref={measureRef}>{suffix}</span>
      </span>
    </span>
  );
}
