import { useId, useState } from "react";
import { Button } from "@aragon/ods";
import { Disclosure } from "@/components/motion/Disclosure";
import { applyFeeBuffer, useFeeCredits } from "../hooks/useFeeCredits";

/** Fee details stay visible; escrow management is a secondary disclosure. */
export const FeeCreditCard = ({
  disabled = false,
  durationSeconds,
}: {
  disabled?: boolean;
  durationSeconds?: number;
}) => {
  const { quote, credit, shortfall, format, symbol, error, depositShortfall, withdraw, isDepositing, isWithdrawing } =
    useFeeCredits(durationSeconds);
  const [open, setOpen] = useState(false);
  const id = useId();
  const loaded = quote !== undefined && credit !== undefined;
  const covered = loaded && shortfall === 0n;
  const amount = (value?: bigint) => `${format(value)}${symbol && value !== undefined ? ` ${symbol}` : ""}`;

  return (
    <section className="composer-fee">
      <div className="composer-summary-line">
        <h2>Estimated fee</h2>
        <span>{amount(quote)}</span>
      </div>
      <p className="composer-help">
        {covered
          ? "Covered by your fee credit."
          : loaded
            ? "A credit deposit is needed before creation."
            : "Loading your fee credit…"}
      </p>
      <button
        type="button"
        className="composer-text-button composer-credit-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        Manage fee credit <span className="composer-plus" data-open={open} aria-hidden="true" />
      </button>
      <Disclosure open={open} id={id}>
        <div className="composer-credit-details">
          <div className="composer-summary-line">
            <span>Your credit</span>
            <span>{amount(credit)}</span>
          </div>
          <p className="composer-help">The encryption fee is charged from this credit when the proposal is created.</p>
          {shortfall > 0n && (
            <>
              <div className="composer-summary-line">
                <span>
                  Deposit needed
                  <br />
                  <small>Includes 10% buffer</small>
                </span>
                <span>{amount(applyFeeBuffer(shortfall))}</span>
              </div>
              <Button
                size="md"
                variant="secondary"
                disabled={disabled || isWithdrawing}
                isLoading={isDepositing}
                onClick={() => depositShortfall()}
              >
                Deposit shortfall
              </Button>
            </>
          )}
          {credit !== undefined && credit > 0n && (
            <Button
              size="sm"
              variant="tertiary"
              disabled={disabled || isDepositing}
              isLoading={isWithdrawing}
              onClick={() => withdraw()}
            >
              Withdraw credit
            </Button>
          )}
          {error && (
            <p className="composer-help text-critical-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </Disclosure>
    </section>
  );
};
