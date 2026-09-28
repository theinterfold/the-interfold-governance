import type { ReactNode } from "react";

/** Shared section heading and compact owner/delegate content. */
export function LockPartyGroup({
  label,
  identity,
  action,
  children,
  labelKey,
  identityKey,
  surfaceKey,
}: {
  label: string;
  identity?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  labelKey?: string;
  identityKey?: string;
  surfaceKey?: string;
}) {
  return (
    <div className="power-party-group">
      <div className="power-party-heading">
        <h3 className="ui-section-title" data-step-key={labelKey}>
          {label}
        </h3>
        {action}
      </div>
      <div className={`power-lock-group${surfaceKey ? " power-lock-group--fluid" : ""}`}>
        {surfaceKey && (
          <div
            className="power-lock-group-surface"
            data-step-key={surfaceKey}
            data-step-surface="true"
            role="presentation"
          />
        )}
        {identity && (
          <div className="power-party-header">
            <div className="power-party-identity" data-step-key={identityKey}>
              {identity}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
