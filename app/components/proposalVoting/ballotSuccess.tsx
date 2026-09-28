import type { ReactNode } from "react";
import { PUB_CHAIN } from "@/constants";

/** A confirmed result, shared by public and secret ballots. */
export function BallotSuccess({
  title = "Vote submitted successfully",
  children,
  txHash,
}: {
  title?: string;
  children?: ReactNode;
  txHash?: string | null;
}) {
  return (
    <div className="vp-submitted" role="status">
      <svg
        className="vp-success-icon"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m7 12 3 3 7-7" />
      </svg>
      <div className="vp-success-content">
        <strong>{title}</strong>
        {children && <div className="vp-success-description">{children}</div>}
        {txHash && (
          <a
            className="ui-text-action"
            href={`${PUB_CHAIN.blockExplorers?.default?.url}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction ↗
          </a>
        )}
      </div>
    </div>
  );
}
