import type { ReactNode } from "react";
import { ExternalArrowSlide } from "@/vendor/site-header/motion";

export function ProposalExternalLink({ href, children, icon }: { href: string; children: string; icon?: ReactNode }) {
  return (
    <a className="group proposal-external-link" href={href} target="_blank" rel="noopener noreferrer">
      <span className="proposal-external-link-content">
        {icon}
        <span>{children}</span>
        <ExternalArrowSlide className="site-nav-arrow" rowClassName="site-nav-arrow-row" />
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
