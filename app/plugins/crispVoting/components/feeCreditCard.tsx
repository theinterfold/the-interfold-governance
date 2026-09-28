import { useEffect, useId, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { ActionButton } from "@/components/input/actionButton";
import { BendingChevron } from "@/vendor/site-header";
import { Disclosure } from "@/components/motion/Disclosure";
import { applyFeeBuffer, useFeeCredits } from "../hooks/useFeeCredits";
import { feeDepositAmount } from "../utils/feeDepositAmount";

/** Fee details stay visible; escrow management is a secondary disclosure. */
export const FeeCreditCard = ({
  disabled = false,
  durationSeconds,
}: {
  disabled?: boolean;
  durationSeconds?: number;
}) => {
  const {
    quote,
    credit,
    balance,
    shortfall,
    decimals,
    format,
    symbol,
    error,
    deposit,
    withdraw,
    isDepositing,
    isWithdrawing,
  } = useFeeCredits(durationSeconds);
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const id = useId();
  useEffect(() => {
    setInput("");
  }, [address]);
  const loaded = quote !== undefined && credit !== undefined;
  const covered = loaded && shortfall === 0n;
  const amount = (value?: bigint) => `${format(value)}${symbol && value !== undefined ? ` ${symbol}` : ""}`;
  const validation = feeDepositAmount(input, decimals, balance);
  const busy = disabled || submitting || isDepositing || isWithdrawing;
  const addCredit = async () => {
    if (busy || submittingRef.current || validation.amount === undefined || !address) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (await deposit(validation.amount)) setInput("");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className="composer-fee">
      <h2 className="ui-section-title">Proposal fee</h2>
      <div className="composer-summary-line">
        <span>Estimated fee</span>
        <span>{amount(quote)}</span>
      </div>
      <p className="composer-help">
        {covered
          ? "Covered by your fee credit."
          : loaded
            ? "A credit deposit is needed before creation."
            : "Loading your fee credit…"}
      </p>
      <div className="composer-credit-management">
        <button
          type="button"
          className="composer-credit-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          Manage fee credit <BendingChevron open={open} />
        </button>
        <Disclosure open={open} id={id}>
          <div className="composer-credit-details">
            <div className="composer-summary-line">
              <span>Your credit</span>
              <span>{amount(credit)}</span>
            </div>
            <p className="composer-help">
              The encryption fee is charged from this credit when the proposal is created.
            </p>
            {shortfall > 0n && (
              <div className="composer-credit-shortfall">
                <p className="composer-help">{amount(applyFeeBuffer(shortfall))} needed, including a 10% buffer.</p>
                <button
                  type="button"
                  className="composer-text-button"
                  disabled={busy || decimals === undefined}
                  onClick={() => setInput(format(applyFeeBuffer(shortfall)))}
                >
                  Use this amount
                </button>
              </div>
            )}
            <div className="composer-field composer-credit-field">
              <label htmlFor={`${id}-amount`}>Amount to add</label>
              <div className="composer-credit-input">
                <input
                  id={`${id}-amount`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={input}
                  disabled={busy || !address}
                  onChange={(event) => setInput(event.target.value)}
                  aria-invalid={!!validation.error}
                  aria-describedby={`${id}-balance${validation.error ? ` ${id}-error` : ""}`}
                />
                <span>{symbol}</span>
              </div>
              <div className="composer-credit-balance">
                <span id={`${id}-balance`}>Wallet balance: {amount(balance)}</span>
                <button
                  type="button"
                  className="composer-text-button"
                  disabled={busy || balance === undefined || decimals === undefined || balance === 0n}
                  onClick={() => setInput(format(balance))}
                >
                  Use max
                </button>
              </div>
              {validation.error && (
                <p className="composer-help text-critical-600" id={`${id}-error`} role="alert">
                  {validation.error}
                </p>
              )}
            </div>
            <ActionButton
              type="button"
              affordance="plus"
              disabled={busy || !address || validation.amount === undefined}
              isLoading={submitting || isDepositing}
              onClick={addCredit}
            >
              Add credit
            </ActionButton>
            {credit !== undefined && credit > 0n && (
              <ActionButton type="button" disabled={busy} isLoading={isWithdrawing} onClick={() => withdraw()}>
                Withdraw credit
              </ActionButton>
            )}
            {error && (
              <p className="composer-help text-critical-600" role="alert">
                {error}
              </p>
            )}
          </div>
        </Disclosure>
      </div>
    </section>
  );
};
