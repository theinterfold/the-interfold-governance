import type { HTMLAttributes, ReactNode } from "react";

/** Shared status surface; names, colours and optional icons belong to the domain. */
export function StatusBadge({
  icon,
  children,
  className = "",
  responsive,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  responsive?: { label: string; short: ReactNode; icon: ReactNode };
}) {
  return (
    <span {...props} className={`badge ${className}`} data-responsive-status={responsive ? true : undefined}>
      {responsive ? <>
        <span className="sr-only">{responsive.label}</span>
        <span data-status-part="full" aria-hidden="true">{icon}{children}</span>
        <span data-status-part="short" aria-hidden="true">{responsive.short}</span>
        <span data-status-part="icon" aria-hidden="true">{responsive.icon}</span>
      </> : <>{icon}{children}</>}
    </span>
  );
}
