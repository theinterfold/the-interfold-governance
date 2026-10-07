import { useId, type ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react";

export function PowerWarning({
  title,
  children,
  id,
  action,
}: {
  title: string;
  children: ReactNode;
  id?: string;
  action?: ReactNode;
}) {
  const headingId = useId();
  return (
    <div id={id} className="power-warning" role="note" aria-labelledby={headingId}>
      <WarningCircle size={20} weight="regular" aria-hidden="true" focusable="false" />
      <div>
        <p id={headingId}>{title}</p>
        <p>{children}</p>
        {action && <div className="power-warning-action">{action}</div>}
      </div>
    </div>
  );
}
