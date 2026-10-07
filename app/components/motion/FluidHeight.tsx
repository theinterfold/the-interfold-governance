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
  layoutKey,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  animate?: boolean;
  expanded?: boolean;
  collapsedHeight?: number;
  onOverflowChange?: (overflows: boolean) => void;
  /** Measure a coordinated layout change before paint, in sync with its content animation. */
  layoutKey?: string;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const targetHeight = useRef<number>();
  const heightAnimation = useRef<Animation>();
  const [height, setHeight] = useState<number>();

  useClientLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      // Filtering a proposal hides an ancestor. Preserve its last size until it is visible again.
      // Measure layout height so an ancestor's modal morph cannot feed a scaled height back into layout.
      if (!content.getClientRects().length) return;
      const next = content.offsetHeight;
      if (next === targetHeight.current) return;
      const surface = surfaceRef.current;
      // Coordinated content uses a full-duration height animation, even on reversal.
      // CSS transitions shorten a reversed transition, which would outrun the moving footer.
      if (layoutKey !== undefined && surface) {
        const styles = getComputedStyle(surface);
        const current = parseFloat(styles.height);
        heightAnimation.current?.cancel();
        if (
          targetHeight.current !== undefined &&
          animate &&
          !surface.closest("[data-morphing]") &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          heightAnimation.current = surface.animate([{ height: `${current}px` }, { height: `${next}px` }], {
            duration: parseFloat(styles.getPropertyValue("--interfold-ui-duration")) || 360,
            easing: styles.getPropertyValue("--interfold-ui-ease").trim() || "cubic-bezier(.2,.8,.2,1)",
          });
        }
      }
      targetHeight.current = next;
      setHeight(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [layoutKey, animate]);

  useEffect(() => () => heightAnimation.current?.cancel(), []);

  useEffect(() => {
    if (height !== undefined && collapsedHeight !== undefined) onOverflowChange?.(height > collapsedHeight);
  }, [height, collapsedHeight, onOverflowChange]);

  const visibleHeight =
    !expanded && collapsedHeight !== undefined ? Math.min(height ?? collapsedHeight, collapsedHeight) : height;

  return (
    <div
      {...props}
      ref={surfaceRef}
      className={`fluid-height ${className}`}
      data-animate={animate && layoutKey === undefined}
      style={{ ...style, height: visibleHeight }}
    >
      <div ref={contentRef} className="fluid-height-content">
        {children}
      </div>
    </div>
  );
}
