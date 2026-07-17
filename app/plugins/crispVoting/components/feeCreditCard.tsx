import { Button, Tag } from "@aragon/ods";
import { If } from "@/components/if";
import { applyFeeBuffer, useFeeCredits } from "../hooks/useFeeCredits";

/**
 * Creator-pays fee escrow widget: shows the fee quote of a proposal created
 * now, the wallet's current credit on the plugin, and deposit/withdraw actions.
 */
export const FeeCreditCard = ({ disabled, durationSeconds }: { disabled?: boolean; durationSeconds?: number }) => {
  const { quote, credit, shortfall, format, depositShortfall, withdraw, isDepositing, isWithdrawing } =
    useFeeCredits(durationSeconds);

  const covered = shortfall === 0n && quote !== undefined && credit !== undefined;

  return (
    <div className="mb-6 flex flex-col gap-y-2 md:gap-y-3">
      <div className="flex flex-col gap-0.5 md:gap-1">
        <div className="flex items-center gap-x-3">
          <p className="field-section-label">Proposal fee credit</p>
          <Tag label={covered ? "Covered" : "Deposit required"} variant={covered ? "success" : "warning"} />
        </div>
        <p className="text-sm font-normal leading-normal text-neutral-500 md:text-base">
          Encrypted proposals pay an E3 computation fee. The fee is charged from your escrowed credit on the plugin when
          the proposal is created.
        </p>
      </div>
      <div className="flex flex-col gap-y-4 rounded-xl border border-neutral-100 bg-neutral-0 p-4">
        <div className="flex flex-col gap-y-1 text-sm font-normal leading-normal text-neutral-800 md:text-base">
          <div className="flex justify-between">
            <span className="text-neutral-500">Estimated fee</span>
            <span>{format(quote)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Your credit</span>
            <span>{format(credit)}</span>
          </div>
          <If true={shortfall > 0n}>
            <div className="flex justify-between">
              <span className="text-neutral-500">Shortfall (incl. 10% buffer)</span>
              <span>{format(applyFeeBuffer(shortfall))}</span>
            </div>
          </If>
        </div>
        <div className="flex gap-x-3">
          <If true={shortfall > 0n}>
            <Button
              size="md"
              variant="secondary"
              disabled={disabled}
              isLoading={isDepositing}
              onClick={() => depositShortfall()}
            >
              Deposit shortfall
            </Button>
          </If>
          <If true={!!credit && credit > 0n}>
            <Button
              size="md"
              variant="tertiary"
              disabled={disabled}
              isLoading={isWithdrawing}
              onClick={() => withdraw()}
            >
              Withdraw credit
            </Button>
          </If>
        </div>
      </div>
    </div>
  );
};
