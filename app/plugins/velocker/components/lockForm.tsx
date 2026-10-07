import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Disclosure } from "@/components/motion/Disclosure";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { useStepTransition } from "@/components/motion/useStepTransition";
import { ExpandingActionLabel } from "@/components/motion/ExpandingActionLabel";
import { AddressText } from "@/components/text/address";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { isAddress, type Address } from "viem";
import { ADDRESS_ZERO } from "@/utils/evm";
import { useMemberName } from "@/hooks/useMemberName";
import { DelegateChooser } from "./delegateChooser";
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
  existingLockedValue?: bigint;
  hasExistingLocks: boolean;
  canDelegate: boolean;
  refreshKey: number;
  onDelegate: (target: Address) => Promise<boolean>;
  delegationError?: string;
  pending: boolean;
  error?: string;
  onConfirm: (owner: Address) => Promise<boolean>;
};

type LockDraft = {
  amount: string;
  delegate?: Address;
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
  const [chosenDelegate, setChosenDelegate] = useState<Address | undefined>(savedDraft.current?.delegate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ownerMode, setOwnerMode] = useState<"self" | "other">(savedDraft.current?.ownerMode ?? "self");
  const layoutKey = `${ownerMode}-${pickerOpen}`;
  const stepMotion = useStepTransition(layoutKey, props.open && !pickerOpen);
  const [ownerInput, setOwnerInput] = useState(savedDraft.current?.ownerInput ?? "");
  const [ownerTouched, setOwnerTouched] = useState(savedDraft.current?.ownerTouched ?? false);
  const delegateEditRef = useRef<HTMLButtonElement>(null);
  const returningFromPicker = useRef(false);
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
      delegate: chosenDelegate,
      ownerMode,
      ownerInput,
      ownerTouched,
      lockConfirmed,
    });
  }, [walletKey, props.value, chosenDelegate, ownerMode, ownerInput, ownerTouched, lockConfirmed]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const target = chosenDelegate ?? props.currentDelegate ?? props.account;
  const noDelegate = target === ADDRESS_ZERO;
  const self = target.toLowerCase() === props.account.toLowerCase();
  const delegateName = useMemberName(self ? undefined : target);
  const currentDelegateName = useMemberName(
    props.currentDelegate?.toLowerCase() === props.account.toLowerCase() ? undefined : props.currentDelegate
  );
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
  const needsDelegation = ownerIsAccount && target.toLowerCase() !== props.currentDelegate?.toLowerCase();
  const delegateLabel = delegateName ?? `${target.slice(0, 6)}…${target.slice(-4)}`;
  const delegationNote = noDelegate
    ? needsDelegation && props.hasExistingLocks
      ? "This applies to all your current and future locks."
      : "No voting power until you choose a delegate."
    : needsDelegation
      ? props.hasExistingLocks
        ? `Also changes who votes with your existing ${props.existingLockedAmount} and future locks.`
        : "This voting choice applies to your new and future locks."
      : undefined;
  const delegationNotice =
    needsDelegation && props.hasExistingLocks ? (
      <PowerWarning
        title={
          noDelegate ? "Your existing locks will lose voting power" : "Your existing locks will also change delegate"
        }
      >
        {props.currentDelegate && props.currentDelegate !== ADDRESS_ZERO ? (
          <>
            {noDelegate ? "Removes " : "Replaces "}
            <AddressText bold={false} label={currentDelegateName}>
              {props.currentDelegate}
            </AddressText>{" "}
            as voting delegate for your existing {props.existingLockedAmount} and future locks.
          </>
        ) : (
          delegationNote
        )}
      </PowerWarning>
    ) : (
      delegationNote && <p className="power-lock-scope">{delegationNote}</p>
    );
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
          ? `This amount exceeds your wallet balance of ${props.balance}. Enter a smaller amount or use max.`
          : "";
  const validation = !lockConfirmed && !noBalance && (!emptyAmount || amountAttempted) ? amountIssue : "";
  const invalid = !!validation;
  const canSubmit =
    !!owner &&
    (lockConfirmed || props.canLock) &&
    (!ownerIsAccount || (props.currentDelegate !== undefined && (!needsDelegation || props.canDelegate)));
  const finishLater = () => {
    setLockConfirmed(false);
    setAttempted(false);
    setAmountAttempted(false);
    setChosenDelegate(undefined);
    setOwnerMode("self");
    setOwnerInput("");
    setOwnerTouched(false);
    props.onValueChange("");
    setCompleted("Your lock is created. You can finish delegation from your account summary.");
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
            ? `${PUB_TOKEN_SYMBOL} locked. ${noDelegate ? "No voting power is delegated." : self ? "You can vote with it." : `Voting power is delegated to ${delegateLabel}.`}`
            : `${PUB_TOKEN_SYMBOL} locked for ${owner.slice(0, 6)}…${owner.slice(-4)}. They own the lock and control withdrawals.`
        );
        setLockConfirmed(false);
        setAttempted(false);
        setAmountAttempted(false);
        setChosenDelegate(undefined);
        setOwnerMode("self");
        setOwnerInput("");
        setOwnerTouched(false);
        props.onValueChange("");
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

  useEffect(() => {
    if (!props.open || pickerOpen) return;
    const focusTarget = returningFromPicker.current ? delegateEditRef.current : inputRef.current;
    focusTarget?.focus({ preventScroll: true });
    returningFromPicker.current = false;
  }, [props.open, pickerOpen]);

  const closePicker = () => {
    returningFromPicker.current = true;
    setPickerOpen(false);
  };

  return (
    <ActionTray
      open={props.open}
      title={pickerOpen ? "Choose voting delegate" : "Lock FOLD"}
      pending={pending}
      triggerRef={props.triggerRef}
      initialFocusRef={pickerOpen ? undefined : inputRef}
      className="power-lock-tray"
      onClose={props.onClose}
      backLabel="Back to lock details"
      onBack={pickerOpen ? closePicker : undefined}
    >
      <FluidHeight layoutKey={layoutKey} className="power-lock-layout">
        <div className="motion-tab-panels">
          <MotionPanel active={!pickerOpen} direction="left">
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
                            The owner chooses their voting delegate. Your delegation stays the same.
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
                      <LockPartyGroup
                        label={
                          needsDelegation && props.currentDelegate !== undefined
                            ? "New voting delegate"
                            : "Voting delegate"
                        }
                        identity={
                          noDelegate ? (
                            "No delegate"
                          ) : (
                            <AddressText bold={false} label={delegateName} withAddress={true}>
                              {target}
                            </AddressText>
                          )
                        }
                        action={
                          <button
                            ref={delegateEditRef}
                            type="button"
                            className="ui-text-action"
                            aria-label="Change voting delegate"
                            disabled={pending || lockConfirmed}
                            onClick={() => {
                              setAttempted(false);
                              setPickerOpen(true);
                            }}
                          >
                            Change delegate
                          </button>
                        }
                      >
                        {!needsDelegation && !noDelegate && (
                          <p className="power-lock-scope">Your current delegate stays the same unless you change it.</p>
                        )}
                        <Disclosure open={!!delegationNote}>
                          <div className="power-party-note">{delegationNotice}</div>
                        </Disclosure>
                      </LockPartyGroup>
                    </div>
                  </Disclosure>
                </div>
                <dl className="power-panel-facts" data-step-key="facts">
                  <div data-step-key="cooldown">
                    <dt>Withdrawal cooldown</dt>
                    <dd>{props.cooldownDays === undefined ? "Loading…" : `${props.cooldownDays} days`}</dd>
                  </div>
                </dl>
                <div className="power-lock-footer">
                  <Disclosure open={lockConfirmed && !pending}>
                    <p className="power-lock-partial">
                      Your FOLD is already locked. Delegation is still incomplete; retrying will only finish delegation.
                    </p>
                  </Disclosure>
                  <div aria-live="polite" aria-atomic="true">
                    <Disclosure open={attempted && !!(phase === "delegating" ? props.delegationError : props.error)}>
                      <p className="power-field-error">
                        {phase === "delegating" ? props.delegationError : props.error}
                      </p>
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
                    aria-describedby={
                      noBalance ? "lock-available-balance" : invalid ? "lock-amount-feedback" : undefined
                    }
                  >
                    {pending ? (
                      phase === "delegating" ? (
                        "Confirm voting choice in wallet"
                      ) : (
                        "Approve and lock in wallet"
                      )
                    ) : lockConfirmed ? (
                      "Retry delegation"
                    ) : ownerIsAccount && needsDelegation ? (
                      noDelegate ? (
                        "Lock FOLD & remove delegate"
                      ) : (
                        "Lock FOLD & delegate votes"
                      )
                    ) : (
                      <ExpandingActionLabel expanded={!ownerIsAccount} suffix=" for another wallet">
                        Approve and lock
                      </ExpandingActionLabel>
                    )}
                  </PowerAction>
                  {lockConfirmed && !pending && (
                    <button type="button" className="power-lock-later" onClick={finishLater}>
                      Finish delegation later
                    </button>
                  )}
                </div>
              </div>
            </form>
          </MotionPanel>
          <MotionPanel active={pickerOpen} direction="right">
            <DelegateChooser
              active={props.open && pickerOpen}
              account={props.account}
              currentDelegate={props.currentDelegate}
              lockedAmount={props.existingLockedValue}
              selected={target}
              pending={pending}
              refreshKey={props.refreshKey}
              draft={true}
              onPick={(target) => {
                setChosenDelegate(target);
                setCompleted("");
                setAttempted(false);
                closePicker();
              }}
            />
          </MotionPanel>
        </div>
      </FluidHeight>
    </ActionTray>
  );
}
