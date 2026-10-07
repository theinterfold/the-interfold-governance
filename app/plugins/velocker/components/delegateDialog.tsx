import { useEffect, useRef, type RefObject } from "react";
import { ActionTray } from "./actionTray";
import { isAddress, type Address } from "viem";
import { ADDRESS_ZERO } from "@/utils/evm";
import { AddressText } from "@/components/text/address";
import { useMemberName } from "@/hooks/useMemberName";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { PowerAction } from "./powerAction";
import { DelegateChooser } from "./delegateChooser";
import { DelegationAmount } from "./delegationAmount";

type Props = {
  open: boolean;
  selected?: Address;
  account: Address;
  currentDelegate?: Address;
  lockedAmount?: bigint;
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
  const reviewRef = useRef<HTMLSpanElement>(null);
  const lastSelected = useRef(selected);
  if (selected) lastSelected.current = selected;
  const reviewTarget = selected ?? lastSelected.current;
  const reviewing = !!selected && !onPick;
  const pick = (target: Address) => (onPick ? onPick(target) : onSelect(target));
  const current = selected?.toLowerCase() === currentDelegate?.toLowerCase();
  const self = reviewTarget?.toLowerCase() === account.toLowerCase();
  const noDelegate = reviewTarget === ADDRESS_ZERO;
  const selectedName = useMemberName(self ? undefined : reviewTarget);
  const currentName = useMemberName(currentDelegate);
  useEffect(() => {
    if (open && reviewing) reviewRef.current?.focus({ preventScroll: true });
  }, [open, reviewing]);

  return (
    <ActionTray
      triggerRef={triggerRef}
      open={open}
      pending={pending}
      title={reviewing ? "Review voting delegate" : "Choose voting delegate"}
      className="delegate-dialog power-lock-tray"
      onClose={onClose}
      onBack={reviewing ? () => onSelect(undefined) : undefined}
      backLabel="Back to delegates"
    >
      <FluidHeight layoutKey={reviewing ? "review" : "choose"}>
        <div className="motion-tab-panels">
          <MotionPanel active={!reviewing} direction="left">
            <DelegateChooser
              active={open && !reviewing}
              account={account}
              currentDelegate={currentDelegate}
              lockedAmount={lockedAmount}
              selected={selected}
              pending={pending}
              refreshKey={refreshKey}
              draft={!!onPick}
              onPick={pick}
            />
          </MotionPanel>
          <MotionPanel active={reviewing} direction="right">
            <div className="delegate-review">
              <span ref={reviewRef} tabIndex={-1} className="sr-only">
                Review voting delegate
              </span>
              <DelegationAmount lockedAmount={lockedAmount} />
              <div className="delegate-chosen">
                <span className="power-label">{noDelegate ? "New delegation" : "New voting delegate"}</span>
                <strong>
                  {noDelegate ? (
                    "No delegate"
                  ) : (
                    <AddressText bold={false} label={selectedName} withAddress={true}>
                      {reviewTarget}
                    </AddressText>
                  )}
                </strong>
              </div>
              <dl className="power-panel-facts">
                <div>
                  <dt>
                    {currentDelegate && currentDelegate !== ADDRESS_ZERO
                      ? "Replaces current delegate"
                      : "Current voting delegate"}
                  </dt>
                  <dd>
                    {!currentDelegate ? (
                      "Loading…"
                    ) : currentDelegate === ADDRESS_ZERO ? (
                      "No delegate"
                    ) : (
                      <AddressText bold={false} label={currentName}>
                        {currentDelegate}
                      </AddressText>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="power-help">
                {noDelegate
                  ? "Removes voting power from all existing and future locks. Ownership and withdrawals remain with your wallet."
                  : self
                    ? "Returns voting power from all existing and future locks to your wallet."
                    : "Applies to all existing and future locks. Ownership and withdrawals remain with your wallet."}
              </p>
              {error && (
                <p className="power-field-error" role="alert">
                  {error}
                </p>
              )}
              <div className="delegate-review-actions">
                <PowerAction
                  intent="confirm"
                  className="delegate-review-confirm"
                  isLoading={pending}
                  disabled={!selected || current || !canDelegate}
                  onClick={() => {
                    if (selected && isAddress(selected)) onConfirm(selected);
                  }}
                >
                  {current ? "Already selected" : noDelegate ? "Confirm no delegate" : "Confirm voting delegate"}
                </PowerAction>
              </div>
            </div>
          </MotionPanel>
        </div>
      </FluidHeight>
    </ActionTray>
  );
}
