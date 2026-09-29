import { Button, DialogContent, DialogHeader, DialogRoot } from "@aragon/ods";
import { formatUnits } from "viem";
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
 */
export const WeightConfirmDialog = ({ confirmation, onAnswer }: WeightConfirmDialogProps) => (
  <DialogRoot open={confirmation !== null} containerClassName="!max-w-[520px]">
    <DialogHeader
      title="Confirm your ballot"
      onCloseClick={() => onAnswer(false)}
      onBackClick={() => onAnswer(false)}
    />
    <DialogContent className="flex flex-col gap-y-4">
      {confirmation && (
        <>
          <p className="text-sm text-neutral-500">
            Your ballot counts a random 99–100% of your voting power, not all of it. This helps protect your privacy.
          </p>
          <div className="border px-4 py-3" style={{ borderColor: "var(--rule)", background: "var(--mint-pale)" }}>
            <p className="text-2xl text-neutral-800">{formatWeightShare(confirmation.weight, confirmation.power)}</p>
            <p className="font-mono text-sm text-neutral-600">
              {/* Ballot units are scaled by 10^(decimals-1); one decimal place restores tokens. */}
              {formatUnits(confirmation.weight, 1)} of {formatUnits(confirmation.power, 1)} {PUB_TOKEN_SYMBOL}
            </p>
          </div>
          <p className="text-xs text-neutral-500">
            To count all of your voting power, cancel and clear &ldquo;Count a random 99–100% of my voting power&rdquo;.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3 pb-6 pt-2">
            <Button size="md" variant="tertiary" onClick={() => onAnswer(false)}>
              Cancel
            </Button>
            <Button size="md" variant="primary" onClick={() => onAnswer(true)}>
              Continue
            </Button>
          </div>
        </>
      )}
    </DialogContent>
  </DialogRoot>
);
