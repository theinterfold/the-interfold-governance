import { AccordionItemContent } from "@aragon/ods";
import { useEffect, useLayoutEffect, useRef, type ComponentProps } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Retain forms when a Radix accordion closes, and let its actual state drive motion and focusability. */
export function AccordionContent({ children, className = "", ...props }: ComponentProps<typeof AccordionItemContent>) {
  const ref = useRef<HTMLDivElement>(null);
  useClientLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      node.inert = node.dataset.state !== "open";
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(node, { attributes: true, attributeFilter: ["data-state"] });
    return () => observer.disconnect();
  }, []);

  // ODS forwards this Radix prop, but does not include it in its public types.
  const presence = { forceMount: true as const };
  return (
    <AccordionItemContent {...props} {...presence} ref={ref} className={`interfold-accordion-content ${className}`}>
      <div className="motion-accordion-body">{children}</div>
    </AccordionItemContent>
  );
}
