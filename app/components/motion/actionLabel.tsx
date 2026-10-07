import type { ReactNode } from "react";

/** Action icons reveal on interaction; status indicators remain visible. */
export function ActionLabel({
  children,
  icon,
  iconBehavior = "reveal",
}: {
  children: ReactNode;
  icon?: ReactNode;
  iconBehavior?: "reveal" | "persistent";
}) {
  if (!icon) return <>{children}</>;
  return (
    <span className="action-label" data-icon-behavior={iconBehavior}>
      <span className="action-label-text">{children}</span>
      <span className="action-label-icon-window" aria-hidden="true">
        <span className="action-label-icon">{icon}</span>
      </span>
    </span>
  );
}
