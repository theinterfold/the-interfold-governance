import type { ReactNode } from "react";
import { ScrollFadeIn } from "@/vendor/site-header/motion";

export function PanelHeader({
  id,
  title,
  count,
  description,
  action,
  className = "",
}: {
  id: string;
  title: string;
  count?: number;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <ScrollFadeIn as="header" className={`ui-panel-header ${className}`}>
      <div className="ui-panel-heading-copy">
        <h2 id={id}>
          {title}
          {count !== undefined && (
            <span className="ui-panel-count" aria-label={`${count} ${title.toLowerCase()}`}>
              {count}
            </span>
          )}
        </h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </ScrollFadeIn>
  );
}
