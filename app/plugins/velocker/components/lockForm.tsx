import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Disclosure } from "@/components/motion/Disclosure";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { useStepTransition } from "@/components/motion/useStepTransition";
import { ExpandingActionLabel } from "@/components/motion/ExpandingActionLabel";
import { AddressText } from "@/components/text/address";
import { PUB_CONSTITUTION_URL, PUB_TOKEN_SYMBOL } from "@/constants";
import { isAddress, type Address } from "viem";
import { ADDRESS_ZERO } from "@/utils/evm";
import { useMemberName } from "@/hooks/useMemberName";
import { formatDurationSeconds } from "@/plugins/spp/components/stageDurationNote";
import { ActionTray } from "./actionTray";
import { PowerAction } from "./powerAction";
import { PowerWarning } from "./powerWarning";
import { LockPartyGroup } from "./lockPartyGroup";
import { runLockFlow, type LockFlowPhase } from "../utils/lockFlow";

type Props = {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement>;
  value: string;
  onValueChange: (value: string) => void;
  balance: string;
  balanceValue?: bigint;
  /**
   * Set while part of the wallet balance has not vested: explains why the available amount is below
   * the balance. The token refuses to move that FOLD, so the form never offers it.
   */
  vestingNote?: string;
  minimum: string;
  /**
   * The exit queue's cooldown in seconds. Unknown while the read is in flight or after it fails.
   * Never fill the gap with a number: a made-up cooldown is a promise the contract has not made.
   */
  cooldownSeconds?: number;
  belowMinimum: boolean;
  aboveBalance: boolean;
  canLock: boolean;
  canUseMax: boolean;
  onMax: () => void;
  account: Address;
  currentDelegate?: Address;
  existingLockedAmount: string;
  hasExistingLocks: boolean;
  /** False until the adapter and the account's locks are known. */
  canActivate: boolean;
  /** Delegates the account's locks to the account. */
  onActivate: () => Promise<boolean>;
  activationError?: string;
  pending: boolean;
  error?: string;
  onConfirm: (owner: Address) => Promise<boolean>;
};

type LockDraft = {
  amount: string;
  ownerMode: "self" | "other";
  ownerInput: string;
  ownerTouched: boolean;
  lockConfirmed: boolean;
};
// Drafts belong to a wallet and survive closing the tray or switching accounts in this session.
const lockDrafts = new Map<string, LockDraft>();

export function LockForm(props: Props) {
  const walletKey = props.account.toLowerCase();
  const savedDraft = useRef(lockDrafts.get(walletKey));
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [amountAttempted, setAmountAttempted] = useState(false);
  const [completed, setCompleted] = useState("");
  const [lockConfirmed, setLockConfirmed] = useState(savedDraft.current?.lockConfirmed ?? false);
  const [phase, setPhase] = useState<LockFlowPhase>("locking");
  const [ownerMode, setOwnerMode] = useState<"self" | "other">(savedDraft.current?.ownerMode ?? "self");
  const stepMotion = useStepTransition(ownerMode, props.open);
  const [ownerInput, setOwnerInput] = useState(savedDraft.current?.ownerInput ?? "");
  const [ownerTouched, setOwnerTouched] = useState(savedDraft.current?.ownerTouched ?? false);
  const processing = useRef(false);
  const mounted = useRef(true);
  const draftReady = useRef(false);
  useEffect(() => {
    props.onValueChange(savedDraft.current?.amount ?? "");
    // The parent keys this form by wallet, so its next mount restores only that wallet's draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!draftReady.current) {
      draftReady.current = true;
      return;
    }
    lockDrafts.set(walletKey, {
      amount: props.value,
      ownerMode,
      ownerInput,
      ownerTouched,
      lockConfirmed,
    });
  }, [walletKey, props.value, ownerMode, ownerInput, ownerTouched, lockConfirmed]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentIsAccount = props.currentDelegate?.toLowerCase() === props.account.toLowerCase();
  const otherDelegate =
    props.currentDelegate && props.currentDelegate !== ADDRESS_ZERO && !currentIsAccount
      ? props.currentDelegate
      : undefined;
  const otherDelegateName = useMemberName(otherDelegate);
  const ownerIsAccount = ownerMode === "self";
  const ownerValid = isAddress(ownerInput) && ownerInput !== ADDRESS_ZERO;
  const ownAddressEntered = ownerInput.toLowerCase() === props.account.toLowerCase();
  const owner = ownerIsAccount ? props.account : ownerValid && !ownAddressEntered ? (ownerInput as Address) : undefined;
  const ownerError =
    ownerIsAccount || (!ownerTouched && !ownerInput)
      ? ""
      : ownAddressEntered
        ? "This is your address. Use your wallet to keep ownership."
        : !ownerValid
          ? "Enter a valid wallet address, starting with 0x."
          : "";
  const needsActivation = ownerIsAccount && props.currentDelegate !== undefined && !currentIsAccount;
  const otherDelegateLabel = (
    <AddressText bold={false} label={otherDelegateName}>
      {otherDelegate}
    </AddressText>
  );
  const activationNotice = needsActivation ? (
    otherDelegate ? (
      props.hasExistingLocks ? (
        <PowerWarning title="Your existing locks will vote for you">
          Your existing {props.existingLockedAmount} and future locks will vote for you instead of {otherDelegateLabel}.
        </PowerWarning>
      ) : (
        <p className="power-lock-scope">Your future locks will vote for you instead of {otherDelegateLabel}.</p>
      )
    ) : (
      <p className="power-lock-scope">
        {props.hasExistingLocks
          ? "This applies to all your current and future locks."
          : "This applies to your new and future locks."}
      </p>
    )
  ) : undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = props.pending || submitting;
  const noBalance = props.balanceValue === 0n && !lockConfirmed;
  const emptyAmount = !/\d/.test(props.value);
  const zeroAmount = !emptyAmount && /^0*(?:\.0*)?$/.test(props.value);
  const amountIssue = emptyAmount
    ? "Enter an amount to lock."
    : zeroAmount
      ? "The amount must be greater than zero."
      : props.belowMinimum
        ? `Each lock requires at least ${props.minimum}. Increase the amount to continue.`
        : props.aboveBalance
          ? props.vestingNote
            ? `Only ${props.balance} has vested and can be locked right now. Enter a smaller amount or use max.`
            : `This amount exceeds your wallet balance of ${props.balance}. Enter a smaller amount or use max.`
          : "";
  const validation = !lockConfirmed && !noBalance && (!emptyAmount || amountAttempted) ? amountIssue : "";
  const invalid = !!validation;
  const canSubmit =
    !!owner &&
    (lockConfirmed || props.canLock) &&
    (!ownerIsAccount || (props.currentDelegate !== undefined && (!needsActivation || props.canActivate)));
  const finishLater = () => {
    setLockConfirmed(false);
    setAttempted(false);
    setAmountAttempted(false);
    setOwnerMode("self");
    setOwnerInput("");
    setOwnerTouched(false);
    props.onValueChange("");
    setCompleted("Your lock is created. Activate its voting power in Your delegation.");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || processing.current || noBalance) return;
    if (!lockConfirmed && amountIssue) {
      setAmountAttempted(true);
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!owner || !canSubmit) return;
    processing.current = true;
    setAttempted(true);
    setSubmitting(true);
    try {
      const result = await runLockFlow({
        lockConfirmed,
        ownerIsAccount,
        needsActivation,
        createLock: () => props.onConfirm(owner),
        activate: props.onActivate,
        onLockConfirmed: () => setLockConfirmed(true),
        onPhase: setPhase,
        canContinue: () => mounted.current,
      });
      if (mounted.current && result === "complete") {
        setCompleted("");
        setLockConfirmed(false);
        setAttempted(false);
        setAmountAttempted(false);
        setOwnerMode("self");
        setOwnerInput("");
        setOwnerTouched(false);
        props.onValueChange("");
        // The page shows the new lock, so close the tray instead of confirming inside it.
        props.onClose();
      }
    } finally {
      processing.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };
  // Keep the last message mounted while its disclosure closes.
  const [lastValidation, setLastValidation] = useState("");
  useEffect(() => {
    if (validation) setLastValidation(validation);
  }, [validation]);

  return (
    <ActionTray
      open={props.open}
      title="Lock FOLD"
      pending={pending}
      triggerRef={props.triggerRef}
      initialFocusRef={inputRef}
      className="power-lock-tray"
      onClose={props.onClose}
    >
      <FluidHeight layoutKey={ownerMode} className="power-lock-layout">
        <form ref={stepMotion.ref} className="power-lock-editor" aria-label="Lock FOLD" onSubmit={submit}>
          <div className="power-lock-body">
            <div className="power-amount-field">
              <label htmlFor="lock-amount" className="sr-only">
                Amount to lock
              </label>
              <div className="power-amount-input power-lock-amount" data-invalid={invalid}>
                <input
                  id="lock-amount"
                  ref={inputRef}
                  inputMode="decimal"
                  placeholder="0.00"
                  autoComplete="off"
                  value={props.value}
                  readOnly={lockConfirmed || pending}
                  aria-describedby={`lock-amount-feedback lock-available-balance${props.vestingNote ? " lock-vesting-note" : ""}`}
                  aria-invalid={invalid}
                  onChange={(event) => {
                    const value = event.target.value.replace(",", ".");
                    if (/^\d*\.?\d*$/.test(value)) {
                      setCompleted("");
                      setAttempted(false);
                      props.onValueChange(value);
                    }
                  }}
                />
                <span className="power-lock-amount-symbol">{PUB_TOKEN_SYMBOL}</span>
              </div>
              <div id="lock-amount-feedback" aria-live="polite" aria-atomic="true">
                <Disclosure open={invalid}>
                  <p className="power-field-error">{validation || lastValidation}</p>
                </Disclosure>
              </div>
              <div className="power-balance-line" data-step-key="balance">
                <span
                  id="lock-available-balance"
                  className={noBalance ? "power-balance-empty" : undefined}
                  aria-live="polite"
                >
                  {noBalance ? (
                    `No ${PUB_TOKEN_SYMBOL} available to lock`
                  ) : (
                    <>
                      <span className="sr-only">Available balance: </span>
                      {props.balance}
                    </>
                  )}
                </span>
                <button
                  type="button"
                  disabled={lockConfirmed || pending || !props.canUseMax}
                  onClick={() => {
                    setCompleted("");
                    setAttempted(false);
                    props.onMax();
                  }}
                >
                  Use max
                </button>
              </div>
              {props.vestingNote && (
                <p id="lock-vesting-note" className="ui-field-lead ui-field-followup">
                  {props.vestingNote}
                </p>
              )}
            </div>
            <div className="power-lock-parties">
              <fieldset
                className="power-lock-owner"
                data-owner-mode={ownerMode}
                data-step-key="owner-controls"
                disabled={pending || lockConfirmed}
              >
                <legend className="sr-only">Lock owner</legend>
                <LockPartyGroup
                  label={ownerIsAccount ? "Lock for your wallet" : "Lock for another wallet"}
                  labelKey="owner-label"
                  identityKey="owner-value"
                  surfaceKey="owner-surface"
                  identity={
                    <div className="motion-tab-panels power-owner-identity-panels">
                      <MotionPanel active={ownerIsAccount} direction="left">
                        <AddressText bold={false}>{props.account}</AddressText>
                      </MotionPanel>
                      <MotionPanel active={!ownerIsAccount} direction="right">
                        <div className="power-owner-address-field" id="lock-other-owner-details">
                          <label htmlFor="lock-owner-address" className="sr-only">
                            Owner’s wallet address
                          </label>
                          <input
                            id="lock-owner-address"
                            value={ownerInput}
                            placeholder="0x…"
                            spellCheck={false}
                            autoComplete="off"
                            aria-invalid={!!ownerError}
                            aria-describedby="lock-owner-feedback lock-owner-description"
                            onChange={(event) => {
                              setOwnerInput(event.target.value.trim());
                              setAttempted(false);
                              setCompleted("");
                            }}
                            onBlur={() => setOwnerTouched(true)}
                          />
                          <div className="power-owner-rule" data-invalid={!!ownerError} role="presentation" />
                        </div>
                      </MotionPanel>
                    </div>
                  }
                  action={
                    <button
                      type="button"
                      className="ui-text-action"
                      aria-expanded={!ownerIsAccount}
                      aria-controls="lock-other-owner-details"
                      onClick={() => {
                        stepMotion.prepare();
                        setOwnerMode(ownerIsAccount ? "other" : "self");
                        setAttempted(false);
                        setCompleted("");
                      }}
                    >
                      {ownerIsAccount ? "Lock for another wallet" : "Use your wallet"}
                    </button>
                  }
                >
                  <Disclosure open={ownerIsAccount}>
                    <p className="ui-field-lead ui-field-followup">You own the lock and control withdrawals.</p>
                  </Disclosure>
                  <div id="lock-owner-feedback" aria-live="polite">
                    {ownerError && <p className="power-field-error">{ownerError}</p>}
                  </div>
                  <Disclosure open={!ownerIsAccount}>
                    <div className="power-party-note" data-step-key="owner-notice">
                      <p className="power-lock-scope">
                        The new owner delegates the lock to themselves to vote with it. Your voting power stays the
                        same.
                      </p>
                      <PowerWarning id="lock-owner-description" title="You’re transferring ownership">
                        You pay the FOLD. This wallet will own the lock and can withdraw it after the cooldown. You
                        cannot take it back.
                      </PowerWarning>
                    </div>
                  </Disclosure>
                </LockPartyGroup>
              </fieldset>
              <Disclosure open={ownerIsAccount} className="power-lock-delegate-disclosure">
                <div className="power-lock-recipient" data-step-key="delegate">
                  <LockPartyGroup label="Voting power" identity="You">
                    {currentIsAccount && <p className="power-lock-scope">You already vote with your locks.</p>}
                    <Disclosure open={needsActivation}>
                      <div className="power-party-note">{activationNotice}</div>
                    </Disclosure>
                  </LockPartyGroup>
                </div>
              </Disclosure>
            </div>
            <dl className="power-panel-facts" data-step-key="facts">
              <div data-step-key="cooldown">
                <dt>Withdrawal cooldown</dt>
                <dd>
                  {props.cooldownSeconds === undefined ? "Loading…" : formatDurationSeconds(props.cooldownSeconds)}
                </dd>
              </div>
            </dl>
            <div className="power-lock-footer">
              <Disclosure open={lockConfirmed && !pending}>
                <p className="power-lock-partial">
                  Your FOLD is already locked. Activation is still incomplete; retrying only finishes activation.
                </p>
              </Disclosure>
              <div aria-live="polite" aria-atomic="true">
                <Disclosure open={attempted && !!(phase === "activating" ? props.activationError : props.error)}>
                  <p className="power-field-error">{phase === "activating" ? props.activationError : props.error}</p>
                </Disclosure>
                <Disclosure open={!!completed}>
                  <p className="power-lock-success">{completed}</p>
                </Disclosure>
              </div>
              <PowerAction
                type="submit"
                intent="confirm"
                className="power-tray-confirm"
                data-step-key="confirm"
                isLoading={pending}
                disabled={pending || noBalance || (!canSubmit && !amountIssue)}
                aria-describedby={noBalance ? "lock-available-balance" : invalid ? "lock-amount-feedback" : undefined}
              >
                {pending ? (
                  phase === "activating" ? (
                    "Confirm activation in wallet"
                  ) : (
                    "Approve and lock in wallet"
                  )
                ) : lockConfirmed ? (
                  "Retry activation"
                ) : needsActivation ? (
                  "Lock FOLD & activate voting power"
                ) : (
                  <ExpandingActionLabel expanded={!ownerIsAccount} suffix=" for another wallet">
                    Approve and lock
                  </ExpandingActionLabel>
                )}
              </PowerAction>
              {/* Constitution art. 3.2: locking in the VE Locker IS the opt-in, so it is disclosed
                here, on the form that locks, rather than anywhere after the fact. */}
              <div className="power-party-note">
                <p className="power-lock-scope">
                  By locking {PUB_TOKEN_SYMBOL} in the Interfold DAO, you opt in to the Interfold Constitution.{" "}
                  <a href={PUB_CONSTITUTION_URL} target="_blank" rel="noreferrer" className="ui-text-action">
                    Read the Constitution →
                  </a>
                </p>
              </div>
              {lockConfirmed && !pending && (
                <button type="button" className="power-lock-later" onClick={finishLater}>
                  Finish activation later
                </button>
              )}
            </div>
          </div>
        </form>
      </FluidHeight>
    </ActionTray>
  );
}
