import type { ReactNode } from "react";
import { AnimatedAmount } from "@/components/motion/AnimatedAmount";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";

/** One live value for the ballot, with the snapshot and exact calculation in its help. */
export function BallotPowerSummary({
  amount,
  share,
  children,
  error,
  warning,
}: {
  amount?: string;
  share?: string;
  children: ReactNode;
  error?: string;
  warning?: ReactNode;
}) {
  return <div className="ballot-power-single" aria-live="polite">
    <div className="ballot-power-single-row">
      <span className="ballot-power-single-label">This vote will use</span>
      <span className="ballot-power-single-values">
        {share && <span className="ballot-power-single-share"><AnimatedAmount plain={true} value={share} /></span>}
        <strong>{amount ? <AnimatedAmount plain={true} value={amount} /> : error ? "Unavailable" : "Calculating…"}</strong>
        <PowerInfo label={warning ? "How this vote's power is calculated — some FOLD does not count" : "How this vote's power is calculated"}
          compact={true} tone={warning ? "warning" : "neutral"} interactive={!!warning} contentClassName={warning ? "ballot-power-help" : ""}>
          {children}
          {warning}
        </PowerInfo>
      </span>
    </div>
    {error && <p className="vp-submission-error" role="alert">{error}</p>}
  </div>;
}
