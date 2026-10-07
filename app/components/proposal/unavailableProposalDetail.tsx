import { ProposalBreadcrumb } from "./proposalReadingHeader";

/** A proposal whose SPP or voting body cannot currently provide a readable detail page. */
export function UnavailableProposalDetail({
  proposalId,
  message,
  status,
  embedded = false,
  onRetry,
}: {
  proposalId: bigint;
  message: string;
  status: string;
  embedded?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section className={embedded ? "w-full min-w-0" : "flex w-screen min-w-full max-w-full flex-col items-center"}>
      <div className={embedded ? "w-full" : "proposal-page"}>
        <div className="proposal-detail-layout">
          {!embedded && <ProposalBreadcrumb identifier={`Proposal #${proposalId}`} />}
          <div className="proposal-detail-main">
            <div className="proposal-detail-reading-column">
              <article className="proposal-detail-reading" data-proposal-part="surface">
                <header className="proposal-reading-header">
                  <div className="proposal-reading-status">
                    <span className="badge failed" data-proposal-part="status">
                      {status}
                    </span>
                  </div>
                  <h1 tabIndex={-1}>Proposal #{proposalId.toString()}</h1>
                </header>
                <div className="proposal-reading-content">
                  <p className="proposal-reading-summary" role="alert">
                    {message}
                  </p>
                  {onRetry && (
                    <button type="button" className="ui-text-action" onClick={onRetry}>
                      Try again
                    </button>
                  )}
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
