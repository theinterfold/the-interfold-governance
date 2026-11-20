import { BallotDisclosure } from "../proposalVoting/ballotDisclosure";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ProposalVotingContext } from "../proposalVoting/proposalVotingContext";
import { useEffect, useRef, type ReactNode } from "react";
import type { IProposalResource, RawAction } from "@/utils/types";
import { BodySection } from "./proposalBodySection";
import { CardResources } from "./cardResources";
import { ProposalActions } from "../proposalActions/proposalActions";
import { ProposalBackToVoting } from "./proposalReadingHeader";
import { useProposalLayout } from "./proposalLayoutContext";

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
  proposalHref,
  readingOnly = false,
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
  proposalHref?: string;
  readingOnly?: boolean;
}) {
  const foldDocument = useMediaQuery("(max-width: 600px)") && !readingOnly;
  const layout = useProposalLayout();
  const votingColumn = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const column = votingColumn.current;
    if (!column) return;
    // Measure natural layout height without constraining it. Tall tool disclosures
    // remain reachable through page scrolling before the column settles at its bottom.
    const measure = () => column.style.setProperty("--proposal-voting-height", `${column.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [readingOnly]);
  const documentBody = (
    <div className="proposal-reading-content" data-proposal-part="document">
      <BodySection body={description} fullLength={foldDocument || readingOnly || layout === "sticky"} />
    </div>
  );
  const attachments = (
    <>
      <ProposalActions actions={actions} />
      {!!resources?.length && <CardResources resources={resources} title="Resources" />}
    </>
  );
  const actionCount = actions.length;
  return (
    <div className="proposal-detail-layout" data-proposal-layout={layout} data-reading-only={readingOnly || undefined}>
      {readingOnly && proposalHref ? (
        <ProposalBackToVoting href={proposalHref} />
      ) : breadcrumb}
      <div className="proposal-detail-main">
        <div className="proposal-detail-reading-column">
          <article className="proposal-detail-reading" data-proposal-part="surface">
            {header}
            {foldDocument ? (
              <BallotDisclosure className="mobile-proposal-document" title={
                <>Proposal details{actionCount > 0 && <small>{actionCount} DAO {actionCount === 1 ? "action" : "actions"}</small>}</>
              }>
                {documentBody}
                {attachments}
              </BallotDisclosure>
            ) : documentBody}
          </article>
          {!foldDocument && attachments}
        </div>
        {!readingOnly && <div className="proposal-detail-voting-column" ref={votingColumn} role="region" aria-label="Voting and round details">
          <div className="proposal-detail-ballot" data-proposal-part="ballot">
            {voting}
            <ProposalVotingContext
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
          {networkProgress && <div className="proposal-round-progress">{networkProgress}</div>}
        </div>}
      </div>
    </div>
  );
}
