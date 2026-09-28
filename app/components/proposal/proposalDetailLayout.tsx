import { BendingChevron } from "@/vendor/site-header";
import type { ReactNode } from "react";
import type { IProposalResource, RawAction } from "@/utils/types";
import { BodySection } from "./proposalBodySection";
import { CardResources } from "./cardResources";
import { ProposalActions } from "../proposalActions/proposalActions";

/** Keep voting context with the ballot; secondary details remain available on demand. */
export function ProposalDetailLayout({
  breadcrumb,
  header,
  description,
  resources,
  actions,
  voting,
  votingPower,
  methodDetails,
  participation,
  stage,
  activity,
  showVotingDetails = false,
}: {
  breadcrumb?: ReactNode;
  header?: ReactNode;
  description: string;
  resources?: IProposalResource[];
  actions: RawAction[];
  voting: ReactNode;
  votingPower?: ReactNode;
  methodDetails?: ReactNode;
  participation: ReactNode;
  stage: ReactNode;
  activity?: ReactNode;
  showVotingDetails?: boolean;
}) {
  return (
    <div className="proposal-detail-layout">
      {breadcrumb}
      <div className="proposal-detail-main">
        <div className="proposal-detail-reading-column">
          <article className="proposal-detail-reading">
            {header}
            <div className="proposal-reading-content">
              <BodySection body={description} />
            </div>
          </article>
          {actions.length > 0 ? (
            <details className="proposal-action-disclosure">
              <summary>
                <span>
                  Actions <span className="proposal-detail-count">{actions.length}</span>
                </span>
                <BendingChevron />
              </summary>
              <p className="proposal-actions-caption">On-chain operations included in this proposal.</p>
              <ProposalActions actions={actions} compact={true} />
            </details>
          ) : (
            <section className="proposal-action-disclosure proposal-actions-empty" aria-label="Actions">
              <h3>
                Actions <span className="proposal-detail-count">0</span>
              </h3>
              <p className="proposal-actions-caption">Signaling proposal. No on-chain actions.</p>
            </section>
          )}
          {!!resources?.length && <CardResources resources={resources} title="Resources" />}
        </div>
        <div className="proposal-detail-ballot">
          {voting}
          <div className="proposal-ballot-context">
            {votingPower}
            <details className="proposal-voting-details" open={showVotingDetails || undefined}>
              <summary>
                <span>Voting details</span>
                <BendingChevron />
              </summary>
              <div className="proposal-ballot-facts">
                {methodDetails}
                {participation}
                {stage}
              </div>
            </details>
            {activity}
          </div>
        </div>
      </div>
    </div>
  );
}
