import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Keep the same surface as its content changes, including asynchronous content and interrupted transitions. */
export function FluidHeight({
  children,
  className = "",
  style,
  animate = true,
  expanded = true,
  collapsedHeight,
  onOverflowChange,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  animate?: boolean;
  expanded?: boolean;
  collapsedHeight?: number;
  onOverflowChange?: (overflows: boolean) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useClientLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      // Filtering a proposal hides an ancestor. Preserve its last size until it is visible again.
      if (content.getClientRects().length) setHeight(content.getBoundingClientRect().height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (height !== undefined && collapsedHeight !== undefined) onOverflowChange?.(height > collapsedHeight);
  }, [height, collapsedHeight, onOverflowChange]);

  const visibleHeight =
    !expanded && collapsedHeight !== undefined ? Math.min(height ?? collapsedHeight, collapsedHeight) : height;

  return (
    <div
      {...props}
      className={`fluid-height ${className}`}
      data-animate={animate}
      style={{ ...style, height: visibleHeight }}
    >
      <div ref={contentRef} className="fluid-height-content">
        {children}
      </div>
    </div>
  );
}
