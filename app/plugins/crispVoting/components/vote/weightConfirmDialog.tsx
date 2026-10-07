import { useRef } from "react";
import { formatUnits } from "viem";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { formatWeightShare, type WeightConfirmation } from "../../utils/ballotWeight";

interface WeightConfirmDialogProps {
  /** The drawn weight that waits for an answer, or `null` when nothing waits. */
  confirmation: WeightConfirmation | null;
  /** `true` continues with the drawn weight, `false` cancels the vote. */
  onAnswer: (accept: boolean) => void;
}

/**
 * Shows the random weight drawn for a ballot, and asks the voter to accept it before the ballot is
 * encrypted and signed.
 *
 * The question arrives after the review tray has closed, so there is no control to morph from: the
 * tray opens in place.
 */
export const WeightConfirmDialog = ({ confirmation, onAnswer }: WeightConfirmDialogProps) => {
  const noTrigger = useRef<HTMLElement>(null);

  return (
    <ActionTray
      open={confirmation !== null}
      title="Confirm your ballot"
      pending={false}
      triggerRef={noTrigger}
      onClose={() => onAnswer(false)}
      className="ballot-review"
    >
      {confirmation && (
        <div className="ballot-review-body">
          <p className="ballot-review-proposal">
            Your ballot counts a random 99–100% of your voting power, not all of it. This helps protect your privacy.
          </p>
          <div className="ballot-review-summary">
            <div className="ballot-review-row">
              <span>Counted weight</span>
              <strong>{formatWeightShare(confirmation.weight, confirmation.power)}</strong>
            </div>
            <div className="ballot-review-row">
              <span>Voting power</span>
              <strong>
                {/* Ballot units are scaled by 10^(decimals-1); one decimal place restores tokens. */}
                {formatUnits(confirmation.weight, 1)} of {formatUnits(confirmation.power, 1)} {PUB_TOKEN_SYMBOL}
              </strong>
            </div>
          </div>
          <p className="ballot-review-proposal">
            To count all of your voting power, cancel and clear &ldquo;Count a random 99–100% of my voting power&rdquo;.
          </p>
          <PowerAction intent="vote" onClick={() => onAnswer(true)}>
            Continue
          </PowerAction>
          <PowerAction onClick={() => onAnswer(false)}>Cancel</PowerAction>
        </div>
      )}
    </ActionTray>
  );
};
