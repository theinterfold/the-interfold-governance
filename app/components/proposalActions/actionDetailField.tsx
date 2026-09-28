import type { ReactNode } from "react";

/** Read-only transaction facts, shared by proposal details and the composer preview. */
export function ActionDetailField({
  label,
  children,
  code = false,
}: {
  label: string;
  children: ReactNode;
  code?: boolean;
}) {
  return (
    <dl className="action-detail-field">
      <dt>{label}</dt>
      <dd className={code ? "action-detail-code" : undefined}>{children}</dd>
    </dl>
  );
}
