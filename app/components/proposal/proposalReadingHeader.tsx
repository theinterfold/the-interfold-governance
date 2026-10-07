import type { ReactNode } from "react";
import Link from "next/link";
import { AddressText } from "@/components/text/address";
import { capitalizeFirstLetter } from "@/utils/text";
import { ArrowLeft } from "@phosphor-icons/react";
import { useProposalBack } from "./proposalNavigation";

export function ProposalBreadcrumb({ identifier }: { identifier: string }) {
  const back = useProposalBack();
  return (
    <nav className="proposal-breadcrumb" aria-label="Breadcrumb">
      <Link
        href="#/"
        scroll={false}
        className="ui-text-action proposal-back"
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (back?.()) event.preventDefault();
        }}
      >
        <ArrowLeft size={16} weight="regular" aria-hidden="true" />
        Back to proposals
      </Link>
      <span aria-current="page">{identifier}</span>
    </nav>
  );
}

export function ProposalReadingHeader({
  title,
  summary,
  creator,
  status,
  statusLabel,
  kind,
  timing,
  badges,
}: {
  title: string;
  summary: string;
  creator: string;
  status?: string;
  /** Badge text when it differs from the status, e.g. "Quorum not met"; the badge style still follows `status`. */
  statusLabel?: string;
  kind: string;
  timing: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <header className="proposal-reading-header">
      <div className="proposal-reading-status">
        {status && (
          <span className={`badge ${status.toLowerCase()}`}>{statusLabel ?? capitalizeFirstLetter(status)}</span>
        )}
        {badges}
        <span className="badge kind">{kind}</span>
        <span className="proposal-reading-timing">{timing}</span>
      </div>
      <h1 tabIndex={-1} data-proposal-ready>
        {title || "(No proposal title)"}
      </h1>
      {summary && <p className="proposal-reading-summary">{summary}</p>}
      <p className="proposal-reading-author">
        <span>By</span> <AddressText bold={false}>{creator}</AddressText>
      </p>
    </header>
  );
}
