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
  inline = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  animate?: boolean;
  expanded?: boolean;
  collapsedHeight?: number;
  onOverflowChange?: (overflows: boolean) => void;
  /** Measure a coordinated layout change before paint, in sync with its content animation. */
  layoutKey?: string;
  /** Use phrasing content when measuring text inside a heading or link. */
  inline?: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const targetHeight = useRef<number>();
  const heightAnimation = useRef<Animation>();
  const [height, setHeight] = useState<number>();
  const [followingContentMotion, setFollowingContentMotion] = useState(false);

  useClientLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    let disposed = false;
    const observedMotion = new Set<Animation>();
    const heightProperties = ["gridTemplateRows", "height", "marginTop", "marginBottom", "paddingTop", "paddingBottom"];

    const measure = (settle = false) => {
      // Filtering a proposal hides an ancestor. Preserve its last size until it is visible again.
      // Measure layout height so an ancestor's modal morph cannot feed a scaled height back into layout.
      if (!content.getClientRects().length) return;
      // A disclosure already owns its intermediate layout heights. Following it
      // directly prevents a second full-duration animation from restarting each frame.
      const contentMotion = content
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.playState === "running" &&
            animation.effect instanceof KeyframeEffect &&
            animation.effect
              .getKeyframes()
              .some((frame) => heightProperties.some((property) => property in frame))
        );
      // Every wrapper must follow a disclosure directly, including wrappers
      // without a layout key. Otherwise each resize restarts its CSS transition
      // and the clipping surface falls behind the content it contains.
      setFollowingContentMotion(contentMotion.length > 0 || settle);
      if (contentMotion.length) {
        heightAnimation.current?.cancel();
        heightAnimation.current = undefined;
      }
      contentMotion.forEach((animation) => {
        if (observedMotion.has(animation)) return;
        observedMotion.add(animation);
        const finish = () => {
          observedMotion.delete(animation);
          // The final resize can arrive after the descendant stops animating.
          if (!disposed) measure(true);
        };
        void animation.finished.then(finish, finish);
      });
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
          !settle &&
          !contentMotion.length &&
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
    const observer = new ResizeObserver(() => measure());
    observer.observe(content);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [layoutKey, animate]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => {
      if (!preference.matches) return;
      // The target height is already in layout; cancellation reveals it immediately.
      heightAnimation.current?.cancel();
      heightAnimation.current = undefined;
    };
    preference.addEventListener("change", settle);
    return () => {
      preference.removeEventListener("change", settle);
      heightAnimation.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (height !== undefined && collapsedHeight !== undefined) onOverflowChange?.(height > collapsedHeight);
  }, [height, collapsedHeight, onOverflowChange]);

  const visibleHeight =
    !expanded && collapsedHeight !== undefined ? Math.min(height ?? collapsedHeight, collapsedHeight) : height;

  const Tag = inline ? "span" : "div";
  return (
    <Tag
      {...props}
      ref={surfaceRef}
      className={`fluid-height ${className}`}
      data-animate={animate && layoutKey === undefined && !followingContentMotion}
      style={{ ...style, height: visibleHeight }}
    >
      <Tag ref={contentRef} className="fluid-height-content">
        {children}
      </Tag>
    </Tag>
  );
}
