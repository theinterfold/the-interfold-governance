import { LoadingIndicator } from "../motion/LoadingTransition";
import { ProposalBackToVoting, ProposalBreadcrumb } from "./proposalReadingHeader";

export function ProposalPlaceholder({ part }: { part: "label" | "title" | "summary" | "action" }) {
  return <span aria-hidden="true" className={`proposal-placeholder proposal-placeholder-${part}`} />;
}

/** Keep the same reading and ballot columns through both the contract and metadata reads. */
export function ProposalDetailLoading({ embedded, backToVoting }: { embedded: boolean; backToVoting?: string }) {
  return (
    <LoadingIndicator>
      <section className={embedded ? "w-full min-w-0" : "proposal-page"}>
        <span role="status" className="sr-only">Loading proposal…</span>
        <div className="proposal-detail-layout" data-proposal-loading="" data-reading-only={backToVoting ? true : undefined} aria-busy="true">
          {backToVoting ? <ProposalBackToVoting href={backToVoting} /> : !embedded && <ProposalBreadcrumb identifier="" />}
          <div className="proposal-detail-main" aria-hidden="true">
            <div className="proposal-detail-reading" data-proposal-part="surface">
              {!embedded && <div className="proposal-reading-header">
                <ProposalPlaceholder part="label" />
                <div className="proposal-loading-heading"><ProposalPlaceholder part="title" /></div>
                <div className="proposal-reading-summary"><ProposalPlaceholder part="summary" /></div>
                <div className="proposal-reading-author"><ProposalPlaceholder part="label" /></div>
              </div>}
              <div className="proposal-reading-content"><ProposalPlaceholder part="summary" /></div>
            </div>
            {!backToVoting && <div className="proposal-detail-ballot">
              <div className="proposal-reading-header">
                <ProposalPlaceholder part="label" />
                <div className="proposal-loading-heading"><ProposalPlaceholder part="title" /></div>
                <ProposalPlaceholder part="summary" />
              </div>
            </div>}
          </div>
        </div>
      </section>
    </LoadingIndicator>
  );
}
