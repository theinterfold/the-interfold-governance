import { StatusBadge } from "@/components/text/statusBadge";

export function ProposalPlaceholder({ part }: { part: "label" | "title" | "summary" | "action" }) {
  return <span aria-hidden="true" className={`proposal-placeholder proposal-placeholder-${part}`} />;
}

export function PendingProposalRow({ kindLabel, title, summary, message }: {
  kindLabel?: string; title?: string; summary?: string; message?: string;
}) {
  return (
    <article className="proposal-item" data-expanded="false" aria-busy="true">
      {message && <span className="sr-only">{message}</span>}
      <div className="proposal-row" aria-hidden={title ? undefined : true}>
        <div className="body">
          <div className="meta">{kindLabel ? <StatusBadge className="kind">{kindLabel}</StatusBadge> : <ProposalPlaceholder part="label" />}</div>
          {title ? <h2 className="proposal-content-arrival">{title}</h2>
            : <div className="proposal-loading-heading"><ProposalPlaceholder part="title" /></div>}
          <div className="summary line-clamp-2">{title ? summary : <ProposalPlaceholder part="summary" />}</div>
          <div className="author"><ProposalPlaceholder part="label" /></div>
        </div>
        <div className="right">
          <div className="time"><ProposalPlaceholder part="label" /></div>
          <div className="proposal-result"><ProposalPlaceholder part="summary" /></div>
          <ProposalPlaceholder part="action" />
        </div>
      </div>
    </article>
  );
}

// Reserve the first screen before the index returns the actual proposal count.
export function PendingProposalRows() {
  return <div className="proposal-list" aria-hidden="true">
    <PendingProposalRow /><PendingProposalRow /><PendingProposalRow />
  </div>;
}
