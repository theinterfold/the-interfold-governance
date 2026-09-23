import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { DialogContent, DialogHeader, DialogRoot } from "@aragon/ods";
import { isAddress, type Address } from "viem";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { ADDRESS_ZERO } from "@/utils/evm";
import { AddressText } from "@/components/text/address";
import { useMemberName } from "@/hooks/useMemberName";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { useInert } from "@/components/motion/useInert";
import { PowerAction } from "./powerAction";
import { DelegateChooser } from "./delegateChooser";

type Props = {
  open: boolean;
  selected?: Address;
  account: Address;
  currentDelegate?: Address;
  lockedAmount: string;
  pending: boolean;
  canDelegate: boolean;
  refreshKey: number;
  triggerRef: RefObject<HTMLElement>;
  onSelect: (address?: Address) => void;
  onClose: () => void;
  onConfirm: (address: Address) => void;
  onPick?: (address: Address) => void;
  error?: string;
};

export function DelegateDialog({
  open,
  selected,
  account,
  currentDelegate,
  lockedAmount,
  pending,
  canDelegate,
  refreshKey,
  triggerRef,
  onSelect,
  onClose,
  onConfirm,
  onPick,
  error,
}: Props) {
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const reviewing = !!selected && !onPick;
  const pick = (target: Address) => (onPick ? onPick(target) : onSelect(target));
  const current = selected?.toLowerCase() === currentDelegate?.toLowerCase();
  const self = selected?.toLowerCase() === account.toLowerCase();
  const selectedName = useMemberName(self ? undefined : selected);
  const currentName = useMemberName(currentDelegate);
  useEffect(() => {
    if (open && reviewing) reviewRef.current?.focus({ preventScroll: true });
  }, [open, reviewing]);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) onClose();
      }}
      containerClassName="interfold-dialog delegate-dialog !max-w-[600px]"
      onEscapeKeyDown={(event) => {
        if (pending) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (pending) event.preventDefault();
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        if (reviewing) reviewRef.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        triggerRef.current?.focus({ preventScroll: true });
      }}
    >
      <DialogHeader
        title={onPick ? "Choose voting delegate" : "Delegate voting power"}
        onCloseClick={() => {
          if (!pending) onClose();
        }}
      />
      <DialogContent>
        <FluidHeight>
          <div className="motion-tab-panels">
            <DialogStep active={!reviewing} direction="left">
              <DelegateChooser
                active={open && !reviewing}
                account={account}
                currentDelegate={currentDelegate}
                selected={selected}
                pending={pending}
                refreshKey={refreshKey}
                draft={!!onPick}
                onPick={pick}
              />
            </DialogStep>
            <DialogStep active={reviewing} direction="right">
              <div className="delegate-review">
                <h2 ref={reviewRef} tabIndex={-1}>
                  Review your delegate
                </h2>
                <div className="delegate-review-primary">
                  <div className="delegate-chosen">
                    <span className="power-label">Your locked {PUB_TOKEN_SYMBOL}</span>
                    <strong>{lockedAmount}</strong>
                  </div>
                  <div className="delegate-chosen">
                    <span className="power-label">Voting delegate</span>
                    <strong>
                      {self ? "Yourself" : (selectedName ?? <AddressText bold={false}>{selected}</AddressText>)}
                    </strong>
                    <code className="delegate-address">{selected}</code>
                  </div>
                </div>
                <dl className="power-panel-facts">
                  <div>
                    <dt>Lock owner</dt>
                    <dd className="delegate-owner-value">
                      <span>Your wallet</span>
                      <code className="delegate-address" title={account}>
                        {account.slice(0, 6)}…{account.slice(-4)}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>Current voting delegate</dt>
                    <dd>
                      {!currentDelegate
                        ? "Loading…"
                        : currentDelegate === ADDRESS_ZERO
                          ? "Not activated"
                          : currentDelegate.toLowerCase() === account.toLowerCase()
                            ? "Yourself"
                            : (currentName ?? <AddressText bold={false}>{currentDelegate}</AddressText>)}
                    </dd>
                  </div>
                </dl>
                <p className="power-help">
                  {self
                    ? "You will vote with all your current and future locks."
                    : "This delegate can vote with all your current and future locks, but cannot withdraw your FOLD."}{" "}
                  Bonded and vesting {PUB_TOKEN_SYMBOL} keep their voting power with you.
                </p>
                <div className="delegate-review-actions">
                  <PowerAction size="lg" disabled={pending} onClick={() => onSelect(undefined)}>
                    <span aria-hidden="true">←</span> Choose delegate
                  </PowerAction>
                  <PowerAction
                    size="lg"
                    intent="confirm"
                    isLoading={pending}
                    disabled={!selected || current || !canDelegate}
                    onClick={() => {
                      if (selected && isAddress(selected) && selected !== ADDRESS_ZERO) onConfirm(selected);
                    }}
                  >
                    {current ? "Already delegated" : "Confirm voting delegate"}
                  </PowerAction>
                </div>
                {error && (
                  <p className="power-field-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </DialogStep>
          </div>
        </FluidHeight>
      </DialogContent>
    </DialogRoot>
  );
}

function DialogStep({ active, direction, children }: { active: boolean; direction: string; children: ReactNode }) {
  const ref = useInert(!active);
  return (
    <div
      ref={ref}
      className="motion-tab-panel"
      data-state={active ? "active" : "inactive"}
      data-direction={direction}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}
