import Head from "next/head";
import { PUB_APP_NAME } from "@/constants";
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
      {identifier && <span aria-current="page">{identifier}</span>}
    </nav>
  );
}

export function ProposalBackToVoting({ href }: { href: string }) {
  return (
    <nav className="proposal-breadcrumb" aria-label="Breadcrumb">
      <a href={href} className="ui-text-action inline-flex items-center gap-2">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to voting
      </a>
    </nav>
  );
}

export function ProposalReadingHeader({
  title,
  summary,
  creator,
  status,
  statusLabel,
  statusClass,
  kind,
  timing,
  badges,
}: {
  title: string;
  summary: string;
  creator: string;
  status?: string;
  /** Badge text when it differs from the status, e.g. "Quorum not met". */
  statusLabel?: string;
  /** Badge style; defaults to the lowercase `status`. When set, `status` is shown as given. */
  statusClass?: string;
  kind: string;
  timing: ReactNode;
  badges?: ReactNode;
}) {
  const badgeLabel = statusLabel ?? (statusClass ? status : capitalizeFirstLetter(status ?? ""));
  return (
    <header className="proposal-reading-header">
      <Head><title>{`${title.trim() || "Proposal"} · ${PUB_APP_NAME}`}</title></Head>
      <div className="proposal-reading-status">
        {status && (
          <span className={`badge ${statusClass ?? status.toLowerCase()}`} data-proposal-part="status">
            {badgeLabel}
          </span>
        )}
        {badges}
        <span className="badge kind" data-proposal-part="method">
          {kind}
        </span>
        {timing && timing !== badgeLabel && (
          <span className="proposal-reading-timing" data-proposal-part="timing">
            {timing}
          </span>
        )}
      </div>
      <h1 tabIndex={-1} data-proposal-ready>
        <span key={title} className="proposal-motion-title proposal-content-arrival" data-proposal-part="title">
          {title || "Proposal"}
        </span>
      </h1>
      {summary && (
        <p className="proposal-reading-summary" data-proposal-part="summary">
          {summary}
        </p>
      )}
      {creator && <p className="proposal-reading-author" data-proposal-part="author">
        <span>By</span> <AddressText bold={false}>{creator}</AddressText>
      </p>}
    </header>
  );
}
