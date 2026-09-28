import type { ReactNode } from "react";
import Link from "next/link";
import { AddressText } from "@/components/text/address";
import { capitalizeFirstLetter } from "@/utils/text";

export function ProposalBreadcrumb({ identifier }: { identifier: string }) {
  return (
    <nav className="proposal-breadcrumb" aria-label="Breadcrumb">
      <Link href="#/">Proposals</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{identifier}</span>
    </nav>
  );
}

export function ProposalReadingHeader({
  title,
  summary,
  creator,
  status,
  kind,
  timing,
  badges,
}: {
  title: string;
  summary: string;
  creator: string;
  status?: string;
  kind: string;
  timing: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <header className="proposal-reading-header">
      <div className="proposal-reading-status">
        {status && <span className={`badge ${status.toLowerCase()}`}>{capitalizeFirstLetter(status)}</span>}
        {badges}
        <span className="badge kind">{kind}</span>
        <span className="proposal-reading-timing">{timing}</span>
      </div>
      <h1>{title || "(No proposal title)"}</h1>
      {summary && <p className="proposal-reading-summary">{summary}</p>}
      <p className="proposal-reading-author">
        <span>By</span> <AddressText bold={false}>{creator}</AddressText>
      </p>
    </header>
  );
}
