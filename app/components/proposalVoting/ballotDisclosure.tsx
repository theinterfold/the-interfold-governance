import { useId, useState, type ReactNode } from "react";
import { Disclosure } from "@/components/motion/Disclosure";
import { BendingChevron } from "@/vendor/site-header";

/** Compose the existing Family disclosure motion for ballot details and activity. */
export function BallotDisclosure({
  title,
  children,
  defaultOpen = false,
  onOpenChange,
  className = "",
}: {
  title: ReactNode | ((chevron: ReactNode) => ReactNode);
  className?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  // Multi-line summaries can place the same Family chevron beside their current state.
  const chevron = <BendingChevron open={open} />;
  return (
    <div className={`proposal-voting-details ${className}`}>
      <button
        className="proposal-disclosure-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          onOpenChange?.(!open);
        }}
      >
        <span>{typeof title === "function" ? title(chevron) : title}</span>
        {typeof title !== "function" && chevron}
      </button>
      <Disclosure id={id} open={open}>
        {children}
      </Disclosure>
    </div>
  );
}
