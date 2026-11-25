import { LoadingIndicator, LoadingText } from "../motion/LoadingTransition";
import { ProposalBackToVoting, ProposalBreadcrumb } from "./proposalReadingHeader";

import { ProposalPlaceholder } from "./pendingProposalRows";

/** Keep the same reading and ballot columns through both the contract and metadata reads. */
export function ProposalDetailLoading({ embedded, backToVoting, document }: {
  embedded: boolean;
  backToVoting?: string;
  document?: { title: string; summary: string };
}) {
  return (
    <LoadingIndicator>
      <section className={embedded ? "w-full min-w-0" : "proposal-page"}>
        <span role="status" className="sr-only">Loading proposal…</span>
        <div className="proposal-detail-layout" data-proposal-loading="" data-proposal-document-ready={!!document?.title || undefined} data-reading-only={backToVoting ? true : undefined} aria-busy="true">
          {backToVoting ? <ProposalBackToVoting href={backToVoting} /> : !embedded && <ProposalBreadcrumb identifier="" />}
          <div className="proposal-detail-main" aria-hidden={!embedded && document?.title ? undefined : true}>
            <div className="proposal-detail-reading" data-proposal-part="surface">
              {!embedded && <div className="proposal-reading-header">
                <ProposalPlaceholder part="label" />
                <h1 aria-busy={!document?.title || undefined}>
                  <LoadingText pending={!document?.title} placeholder={<ProposalPlaceholder part="title" />}>
                    {document?.title}
                  </LoadingText>
                </h1>
                <div className="proposal-reading-summary">{document?.title ? document.summary : <ProposalPlaceholder part="summary" />}</div>
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
