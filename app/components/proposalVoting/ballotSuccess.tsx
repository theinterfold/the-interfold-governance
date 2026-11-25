import { TransactionLink } from "./transactionLink";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/input/actionButton";
import { SuccessBanner } from "@/components/alert/successBanner";
import { PUB_CHAIN } from "@/constants";

/** A confirmed result, shared by public and secret ballots. */
export function BallotSuccess({
  title = "Vote submitted",
  children,
  txHash,
  choice,
  action,
}: {
  title?: string;
  children?: ReactNode;
  txHash?: string | null;
  choice?: string;
  action?: ReactNode;
}) {
  return (
    <div className="vp-submitted" role="status">
      <SuccessBanner title={title} action={txHash ? (
          <TransactionLink href={`${PUB_CHAIN.blockExplorers?.default?.url}/tx/${txHash}`} ariaLabel="View vote transaction on the explorer"/>
        ) : undefined} />
      <div className="vp-success-content">
        {choice !== undefined && (
          <div className="vp-success-choice-row">
            <p className="vp-success-choice">
              <span>Your vote:</span> <strong>{choice}</strong>
            </p>
            {action}
          </div>
        )}
        {children && <div className="vp-success-description">{children}</div>}
        {choice === undefined && action && <div className="vp-success-choice-row">{action}</div>}

      </div>
    </div>
  );
}

/** A secondary edit action shared by every confirmed-vote presentation. */
export function VoteChangeAction({
  disabled,
  votingClosed,
  onChange,
  presentation = "inline",
}: {
  disabled: boolean;
  votingClosed: boolean;
  onChange: () => void;
  presentation?: "inline" | "footer";
}) {
  if (disabled || votingClosed) return null;
  if (presentation === "footer") return <ActionButton size="compact" onClick={onChange}>Change vote</ActionButton>;
  return (
    <button type="button" className="vp-success-change" onClick={onChange}>
      Change vote
    </button>
  );
}
