import type { IVote } from "@/utils/types";
import { BallotActivity } from "./ballotActivity";
import { WalletListRow } from "@/components/walletListRow";
import { EnsMember } from "@/components/text/ensMember";
import { ListTokenAmount } from "@/components/text/listValue";
import { StatusBadge } from "@/components/text/statusBadge";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber } from "@/utils/numbers";
import { useState } from "react";
import { ActionButton } from "@/components/input/actionButton";

const PAGE_SIZE = 6;

export function PublicVotes({
  votes,
  isLoading = false,
  isError = false,
  hasLoaded = true,
  onRetry,
}: {
  votes: (IVote & { votingPower?: string })[];
  isLoading?: boolean;
  isError?: boolean;
  hasLoaded?: boolean;
  onRetry?: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const labels = { yes: "Yes", approve: "Approve", no: "No", abstain: "Abstain" };
  const states = { yes: "accepted", approve: "accepted", no: "rejected", abstain: "pending" };
  return (
    <BallotActivity
      title={<>Public votes {hasLoaded && <span className="proposal-detail-count">{votes.length}</span>}</>}
    >
      <div className="proposal-activity-body">
        {isLoading && (
          <p className="ui-label" role="status">
            {hasLoaded ? "Updating public votes…" : "Loading public votes…"}
          </p>
        )}
        {isError && (
          <div className="power-help" role="alert">
            <p>
              {hasLoaded
                ? "Could not refresh public votes. Showing the last loaded votes."
                : "Could not load public votes right now."}
            </p>
            {onRetry && (
              <button type="button" className="ui-text-action" onClick={onRetry}>
                Try again
              </button>
            )}
          </div>
        )}
        {hasLoaded && !isLoading && !isError && !votes.length && <p className="ui-label">No votes cast.</p>}
        <div className="delegate-picker-list" role="list" aria-label="Public votes">
          {votes.slice(0, visibleCount).map((vote, index) => (
            <div
              key={`${vote.address}-${index}`}
              role="listitem"
              className="border-b border-[var(--rule)] last:border-b-0"
            >
              <WalletListRow
                identity={
                  <div className="delegate-identity-content">
                    <EnsMember address={vote.address} />
                    <div className="pl-9">
                      <ListTokenAmount
                        value={vote.votingPower === undefined ? "-" : compactNumber(vote.votingPower)}
                        symbol={PUB_TOKEN_SYMBOL}
                      />
                    </div>
                  </div>
                }
              >
                <StatusBadge className={states[vote.variant]}>{labels[vote.variant]}</StatusBadge>
              </WalletListRow>
            </div>
          ))}
        </div>
        {votes.length > PAGE_SIZE && (
          <div className="delegate-list-pagination">
            <p role="status">
              {Math.min(visibleCount, votes.length)} of {votes.length} votes
            </p>
            {visibleCount < votes.length && (
              <ActionButton onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Load more</ActionButton>
            )}
          </div>
        )}
      </div>
    </BallotActivity>
  );
}
