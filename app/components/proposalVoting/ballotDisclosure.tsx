import { useId, useState, type ReactNode } from "react";
import { Disclosure } from "@/components/motion/Disclosure";
import { BendingChevron } from "@/vendor/site-header";

/** Compose the existing Family disclosure motion for ballot details and activity. */
export function BallotDisclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="proposal-voting-details">
      <button
        className="proposal-disclosure-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <BendingChevron open={open} />
      </button>
      <Disclosure id={id} open={open}>
        {children}
      </Disclosure>
    </div>
  );
}
