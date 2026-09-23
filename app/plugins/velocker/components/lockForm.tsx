import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Icon, IconType } from "@aragon/ods";
import { Disclosure } from "@/components/motion/Disclosure";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { isAddress, type Address } from "viem";
import { ADDRESS_ZERO } from "@/utils/evm";
import { useMemberName } from "@/hooks/useMemberName";
import { DelegateChooser } from "./delegateChooser";
import { ActionTray } from "./actionTray";
import { PowerAction } from "./powerAction";
import { runLockFlow, type LockFlowPhase } from "../utils/lockFlow";

type Props = {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement>;
  value: string;
  onValueChange: (value: string) => void;
  balance: string;
  minimum: string;
  cooldownDays?: number;
  belowMinimum: boolean;
  aboveBalance: boolean;
  canLock: boolean;
  canUseMax: boolean;
  onMax: () => void;
  account: Address;
  currentDelegate?: Address;
  existingLockedAmount: string;
  hasExistingLocks: boolean;
  canDelegate: boolean;
  refreshKey: number;
  onDelegate: (target: Address) => Promise<boolean>;
  delegationError?: string;
  pending: boolean;
  error?: string;
  onConfirm: (owner: Address) => Promise<boolean>;
};

export function LockForm(props: Props) {
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [completed, setCompleted] = useState("");
  const [lockConfirmed, setLockConfirmed] = useState(false);
  const [phase, setPhase] = useState<LockFlowPhase>("locking");
  const [chosenDelegate, setChosenDelegate] = useState<Address>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ownerMode, setOwnerMode] = useState<"self" | "other">("self");
  const [ownerInput, setOwnerInput] = useState("");
  const [ownerTouched, setOwnerTouched] = useState(false);
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const processing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const target =
    chosenDelegate ??
    (props.currentDelegate && props.currentDelegate !== ADDRESS_ZERO ? props.currentDelegate : props.account);
  const self = target.toLowerCase() === props.account.toLowerCase();
  const delegateName = useMemberName(self ? undefined : target);
  const ownerIsAccount = ownerMode === "self";
  const ownerValid = isAddress(ownerInput) && ownerInput !== ADDRESS_ZERO;
  const ownAddressEntered = ownerInput.toLowerCase() === props.account.toLowerCase();
  const owner = ownerIsAccount ? props.account : ownerValid && !ownAddressEntered ? (ownerInput as Address) : undefined;
  const ownerError =
    ownerIsAccount || (!ownerTouched && !ownerInput)
      ? ""
      : ownAddressEntered
        ? "This is your address. Choose Your wallet to keep ownership."
        : !ownerValid
          ? "Enter a valid wallet address, starting with 0x."
          : "";
  const needsDelegation = ownerIsAccount && target.toLowerCase() !== props.currentDelegate?.toLowerCase();
  const delegateLabel = self ? "Yourself" : (delegateName ?? `${target.slice(0, 6)}…${target.slice(-4)}`);
  const delegationNote = needsDelegation
    ? props.hasExistingLocks
      ? `Also changes who votes with your existing ${props.existingLockedAmount} and future locks.`
      : "This voting choice applies to your new and future locks."
    : "Your current voting delegate also applies to this new lock.";
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = props.pending || submitting;
  const invalid = !lockConfirmed && (props.belowMinimum || props.aboveBalance);
  const canSubmit =
    !!owner &&
    (lockConfirmed || props.canLock) &&
    (!ownerIsAccount || (props.currentDelegate !== undefined && props.canDelegate));
  const finishLater = () => {
    setLockConfirmed(false);
    setReviewing(false);
    setAttempted(false);
    setChosenDelegate(undefined);
    props.onValueChange("");
    setCompleted("Your lock is created. You can finish delegation from your account summary.");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!owner || !canSubmit || pending || processing.current) return;
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    processing.current = true;
    setAttempted(true);
    setSubmitting(true);
    try {
      const result = await runLockFlow({
        lockConfirmed,
        ownerIsAccount,
        needsDelegation,
        createLock: () => props.onConfirm(owner),
        delegate: () => props.onDelegate(target),
        onLockConfirmed: () => setLockConfirmed(true),
        onPhase: setPhase,
        canContinue: () => mounted.current,
      });
      if (mounted.current && result === "complete") {
        setCompleted(
          ownerIsAccount
            ? `${PUB_TOKEN_SYMBOL} locked. ${self ? "You can vote with it." : `Voting power is delegated to ${delegateLabel}.`}`
            : `${PUB_TOKEN_SYMBOL} locked for ${owner.slice(0, 6)}…${owner.slice(-4)}. They own the lock and control withdrawals.`
        );
        setLockConfirmed(false);
        setReviewing(false);
        setAttempted(false);
        props.onValueChange("");
      }
    } finally {
      processing.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };
  const validation = props.aboveBalance
    ? `Amount exceeds your available balance of ${props.balance}.`
    : props.belowMinimum
      ? `Enter at least ${props.minimum}.`
      : "";

  // Keep the last message mounted while its disclosure closes.
  const [lastValidation, setLastValidation] = useState("");
  useEffect(() => {
    if (validation) setLastValidation(validation);
  }, [validation]);

  useEffect(() => {
    if (!props.open || pickerOpen) return;
    (reviewing ? reviewRef.current : inputRef.current)?.focus({ preventScroll: true });
  }, [props.open, reviewing, pickerOpen]);

  return (
    <ActionTray
      open={props.open}
      title={pickerOpen ? "Choose voting delegate" : reviewing ? "Review lock" : "Lock FOLD"}
      pending={pending}
      triggerRef={props.triggerRef}
      initialFocusRef={pickerOpen ? undefined : reviewing ? reviewRef : inputRef}
      className="power-lock-tray"
      onClose={props.onClose}
      backLabel={pickerOpen ? "Back to review" : "Edit lock details"}
      onBack={
        pickerOpen
          ? () => setPickerOpen(false)
          : reviewing && !lockConfirmed
            ? () => {
                setReviewing(false);
                setAttempted(false);
              }
            : undefined
      }
    >
      <Disclosure open={!pickerOpen}>
        <form className="power-lock-editor" aria-label="Lock FOLD" onSubmit={submit}>
          <div className="power-lock-body">
            <div className="power-amount-field" ref={reviewRef} tabIndex={-1}>
              <label htmlFor="lock-amount" className="power-label">
                Amount to lock
              </label>
              <div className="power-amount-input" data-invalid={invalid} data-reviewing={reviewing}>
                <input
                  id="lock-amount"
                  ref={inputRef}
                  inputMode="decimal"
                  placeholder="0.00"
                  autoComplete="off"
                  value={props.value}
                  readOnly={reviewing || lockConfirmed || pending}
                  aria-describedby="lock-amount-feedback lock-available-balance"
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
                <span>{PUB_TOKEN_SYMBOL}</span>
              </div>
              <div id="lock-amount-feedback" aria-live="polite" aria-atomic="true">
                <Disclosure open={invalid}>
                  <p className="power-field-error">{validation || lastValidation}</p>
                </Disclosure>
              </div>
              <div className="power-balance-line">
                <span id="lock-available-balance">Available {props.balance}</span>
                {!reviewing && (
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
                )}
              </div>
            </div>
            <Disclosure open={!reviewing}>
              <fieldset className="power-lock-owner" disabled={reviewing || pending || lockConfirmed}>
                <legend className="power-label">Lock owner</legend>
                <div className="power-owner-options">
                  {(
                    [
                      ["self", "Your wallet"],
                      ["other", "Another wallet"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="lock-owner"
                        value={value}
                        checked={ownerMode === value}
                        onChange={() => {
                          setOwnerMode(value);
                          setAttempted(false);
                          setCompleted("");
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <Disclosure open={!ownerIsAccount}>
                  <div className="power-owner-address-field">
                    <label htmlFor="lock-owner-address">Owner’s wallet address</label>
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
                    <div id="lock-owner-feedback" aria-live="polite">
                      {ownerError && <p className="power-field-error">{ownerError}</p>}
                    </div>
                  </div>
                </Disclosure>
              </fieldset>
              {ownerIsAccount && <p className="power-owner-description">You own the lock and control withdrawals.</p>}
            </Disclosure>
            <Disclosure open={reviewing}>
              <div className="power-lock-review-details">
                <div className="power-lock-reviewed-owner">
                  <span className="power-label">Lock owner</span>
                  <strong>{ownerIsAccount ? "Your wallet" : "Another wallet"}</strong>
                  {!ownerIsAccount && <code className="delegate-address">{owner}</code>}
                </div>
                {ownerIsAccount ? (
                  <div className="power-lock-recipient">
                    <span className="power-label">Voting delegate</span>
                    <button
                      type="button"
                      ref={pickerTrigger}
                      className="power-lock-recipient-choice"
                      disabled={pending || lockConfirmed}
                      onClick={() => setPickerOpen(true)}
                    >
                      <span>{delegateLabel}</span>
                      <span className="power-lock-recipient-action">
                        Choose delegate <span aria-hidden="true">→</span>
                      </span>
                    </button>
                    {!self && (
                      <div className="power-lock-recipient-meta">
                        <code className="delegate-address">{target}</code>
                        <button
                          type="button"
                          className="power-remove-delegate"
                          disabled={pending || lockConfirmed}
                          title="Return voting power to yourself"
                          onClick={() => {
                            setChosenDelegate(props.account);
                            setAttempted(false);
                            setCompleted("");
                            pickerTrigger.current?.focus({ preventScroll: true });
                          }}
                        >
                          Remove delegate
                        </button>
                      </div>
                    )}
                    <p className="power-lock-scope">{delegationNote}</p>
                  </div>
                ) : (
                  <p className="power-lock-scope">
                    The owner chooses their voting delegate. Your delegation stays the same.
                  </p>
                )}
              </div>
            </Disclosure>
            <Disclosure open={!ownerIsAccount}>
              <div
                id="lock-owner-description"
                className="power-ownership-warning"
                role="note"
                aria-labelledby="ownership-warning-title"
              >
                <Icon icon={IconType.WARNING} size="md" aria-hidden="true" />
                <div>
                  <p id="ownership-warning-title">You’re transferring ownership</p>
                  <p>
                    You pay the FOLD. This wallet will own the lock and can withdraw it after the cooldown. You cannot
                    take it back.
                  </p>
                </div>
              </div>
            </Disclosure>
            <dl className="power-panel-facts">
              {!reviewing && (
                <div>
                  <dt>Minimum lock</dt>
                  <dd>{props.minimum}</dd>
                </div>
              )}
              <div>
                <dt>Withdrawal cooldown</dt>
                <dd>{props.cooldownDays === undefined ? "Loading…" : `${props.cooldownDays} days`}</dd>
              </div>
            </dl>
            <div className="power-lock-footer">
              <Disclosure open={reviewing}>
                <p className="power-tray-note">
                  {!ownerIsAccount
                    ? "Approve FOLD from your wallet, then create the lock for the full address shown above."
                    : needsDelegation
                      ? "Your wallet will ask you to approve FOLD, create your lock, then delegate voting power separately."
                      : "Your wallet will ask you to approve FOLD and create your lock."}
                </p>
              </Disclosure>
              <Disclosure open={lockConfirmed && !pending}>
                <p className="power-lock-partial">
                  Your FOLD is already locked. Delegation is still incomplete; retrying will only finish delegation.
                </p>
              </Disclosure>
              <PowerAction
                type="submit"
                intent="confirm"
                size="lg"
                className="power-tray-confirm"
                isLoading={pending}
                disabled={!canSubmit || pending}
              >
                {pending
                  ? phase === "delegating"
                    ? "Confirm delegation in wallet"
                    : "Approve and lock in wallet"
                  : lockConfirmed
                    ? "Retry delegation"
                    : reviewing
                      ? !ownerIsAccount
                        ? "Approve & lock for this wallet"
                        : needsDelegation
                          ? "Lock FOLD & delegate votes"
                          : "Approve and lock"
                      : "Continue"}
              </PowerAction>
              {lockConfirmed && !pending && (
                <button type="button" className="power-lock-later" onClick={finishLater}>
                  Finish delegation later
                </button>
              )}
              <div aria-live="polite" aria-atomic="true">
                <Disclosure open={attempted && !!(phase === "delegating" ? props.delegationError : props.error)}>
                  <p className="power-field-error">{phase === "delegating" ? props.delegationError : props.error}</p>
                </Disclosure>
                <Disclosure open={!!completed}>
                  <p className="power-lock-success">{completed}</p>
                </Disclosure>
              </div>
            </div>
          </div>
        </form>
      </Disclosure>
      <Disclosure open={pickerOpen}>
        <DelegateChooser
          active={props.open && pickerOpen}
          account={props.account}
          currentDelegate={props.currentDelegate}
          selected={target}
          pending={pending}
          refreshKey={props.refreshKey}
          draft={true}
          onPick={(target) => {
            setChosenDelegate(target);
            setCompleted("");
            setAttempted(false);
            setPickerOpen(false);
          }}
        />
      </Disclosure>
    </ActionTray>
  );
}
