import { BendingChevron } from "@/vendor/site-header";
import { ActionButton } from "@/components/input/actionButton";
import { useId, useState, type ReactNode } from "react";
import { Disclosure } from "@/components/motion/Disclosure";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { useGroupedDisclosureMotion } from "@/components/motion/useGroupedDisclosureMotion";

type Props = {
  className?: string;
  title: string;
  renderHeading?: (toggle: ReactNode) => ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  toolbar?: ReactNode;
  summary?: ReactNode | ((open: boolean) => ReactNode);
  toggleLabels?: { closed: string; open: string };
  renderToggle?: (props: { open: boolean; controls: string; onToggle: () => void }) => ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Shared disclosure for the supporting lists inside voting power cards. */
export function PowerDisclosure({
  className = "",
  title,
  renderHeading,
  description,
  status,
  toolbar,
  summary,
  toggleLabels,
  renderToggle,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const travel = useGroupedDisclosureMotion(open);
  const onToggle = () => {
    travel.prepare();
    setOpen(!open);
  };
  const separateToggle = Boolean(toggleLabels ?? renderToggle);
  const chevron = <BendingChevron open={open} className="power-disclosure-chevron" />;
  const copy = (
    <span className="power-disclosure-copy">
      <span className="power-disclosure-label">
        <span className="power-disclosure-title">{title}</span>
        {!separateToggle && chevron}
      </span>
      {description && <span className="power-disclosure-description">{description}</span>}
      {status && <span className="power-disclosure-status">{status}</span>}
    </span>
  );
  const toggle = renderToggle ? (
    renderToggle({ open, controls: id, onToggle })
  ) : (
    <ActionButton
      type="button"
      className={`power-disclosure-toggle${toggleLabels ? " power-disclosure-explicit" : ""}`}
      aria-expanded={open}
      aria-controls={id}
      onClick={onToggle}
    >
      {toggleLabels ? (
        <>
          {open ? toggleLabels.open : toggleLabels.closed}
          {chevron}
        </>
      ) : (
        copy
      )}
    </ActionButton>
  );
  return (
    <section
      ref={travel.ref}
      className={`power-disclosure grouped-disclosure-motion ${className}`}
      data-open={open}
      aria-label={title}
    >
      <FluidHeight className="power-disclosure-heading-surface">
        <div className="power-disclosure-header">
          <div className="power-disclosure-main" data-has-summary={!!summary}>
            {renderHeading ? (
              renderHeading(toggle)
            ) : (
              <>
                {separateToggle && copy}
                {summary && (
                  <div className="power-disclosure-summary" aria-hidden={open}>
                    {typeof summary === "function" ? summary(open) : summary}
                  </div>
                )}
                <div className="power-disclosure-actions">
                  {toggle}
                  {toolbar}
                </div>
              </>
            )}
          </div>
        </div>
      </FluidHeight>
      <Disclosure id={id} open={open}>
        <div className="power-disclosure-content">{children}</div>
      </Disclosure>
      <div ref={travel.overlayRef} className="grouped-motion-overlay" aria-hidden="true" />
    </section>
  );
}
