import { AccordionItemHeader } from "@aragon/ods";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { BendingChevron } from "@/vendor/site-header";

/** Keep the accessible Radix trigger while sharing the homepage chevron. */
export const AccordionHeader = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof AccordionItemHeader>>(
  function AccordionHeader({ children, className = "", ...props }, ref) {
    return (
      <AccordionItemHeader {...props} ref={ref} className={`interfold-accordion-trigger ${className}`}>
        {children}
        <BendingChevron />
      </AccordionItemHeader>
    );
  }
);
