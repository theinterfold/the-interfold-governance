import type { HTMLAttributes, ReactNode } from "react";

/** Shared status surface; names, colours and optional icons belong to the domain. */
export function StatusBadge({
  icon,
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { icon?: ReactNode }) {
  return (
    <span {...props} className={`badge ${className}`}>
      {icon}
      {children}
    </span>
  );
}
