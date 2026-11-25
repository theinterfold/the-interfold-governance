import type { ReactNode } from "react";
import { Disclosure } from "@/components/motion/Disclosure";

/** Shared Signal confirmation: inset panel banner or compact notification. */
export function SuccessBanner({
  title,
  children,
  action,
  icon,
  compact = false,
  announce = false,
  disclosure,
  secondary = false,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Optional persistent identity while a submission becomes a confirmation. */
  icon?: ReactNode;
  compact?: boolean;
  announce?: boolean;
  disclosure?: { open: boolean; id: string };
  secondary?: boolean;
}) {
  return (
    <div className="ui-success-banner" data-compact={compact || secondary || undefined} data-secondary={secondary || undefined} data-disclosure={!!disclosure || undefined} role={announce ? "status" : undefined}>
      <div className="ui-success-banner-top">
      <div className="ui-success-banner-heading">
        {icon ?? <svg className="ui-success-banner-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m7 12 3 3 7-7" />
        </svg>}
        <strong>{title}</strong>
      </div>
      {action && <div className="ui-success-banner-action">{action}</div>}
      </div>
      {children && (disclosure ? (
        <Disclosure open={disclosure.open} id={disclosure.id}>
          <div className="ui-success-banner-content">{children}</div>
        </Disclosure>
      ) : <div className="ui-success-banner-content">{children}</div>)}
    </div>
  );
}
