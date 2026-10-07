import { ProposalVotingContext } from "../proposalVoting/proposalVotingContext";
import { BallotDisclosure } from "../proposalVoting/ballotDisclosure";
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
  personalVote,
  networkProgress,
  methodDetails,
  participation,
  stage,
  activity,
}: {
  breadcrumb?: ReactNode;
  header?: ReactNode;
  description: string;
  resources?: IProposalResource[];
  actions: RawAction[];
  voting: ReactNode;
  personalVote?: ReactNode;
  networkProgress?: ReactNode;
  methodDetails?: ReactNode;
  participation: ReactNode;
  stage: ReactNode;
  activity?: ReactNode;
}) {
  return (
    <div className="proposal-detail-layout">
      {breadcrumb}
      <div className="proposal-detail-main">
        <div className="proposal-detail-reading-column">
          <article className="proposal-detail-reading" data-proposal-part="surface">
            {header}
            <div className="proposal-reading-content" data-proposal-part="document">
              <BodySection body={description} />
            </div>
          </article>
          {actions.length > 0 ? (
            <BallotDisclosure
              className="proposal-action-disclosure"
              title={
                <span>
                  Actions <span className="proposal-detail-count">{actions.length}</span>
                </span>
              }
            >
              <div className="proposal-action-disclosure-body">
                <p className="proposal-actions-caption">On-chain operations included in this proposal.</p>
                <ProposalActions actions={actions} compact={true} />
              </div>
            </BallotDisclosure>
          ) : (
            <section className="proposal-action-disclosure proposal-actions-empty" aria-label="Actions">
              <h3>
                Actions <span className="proposal-detail-count">0</span>
              </h3>
            </section>
          )}
          {!!resources?.length && <CardResources resources={resources} title="Resources" />}
        </div>
        <div className="proposal-detail-ballot" data-proposal-part="ballot">
          {voting}
          <ProposalVotingContext
            networkProgress={networkProgress}
            personalVote={personalVote}
            details={
              <div className="proposal-ballot-facts">
                {methodDetails}
                {participation}
                {stage}
              </div>
            }
            activity={activity}
          />
        </div>
      </div>
    </div>
  );
}
