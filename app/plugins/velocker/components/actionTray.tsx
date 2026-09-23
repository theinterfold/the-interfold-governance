import type { ReactNode, RefObject } from "react";
import { DialogContent, DialogHeader, DialogRoot } from "@aragon/ods";

type Props = {
  open: boolean;
  title: string;
  pending: boolean;
  triggerRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
  children: ReactNode;
};

export function ActionTray({
  open,
  title,
  pending,
  triggerRef,
  initialFocusRef,
  onClose,
  onBack,
  backLabel = "Back",
  className = "",
  children,
}: Props) {
  return (
    <DialogRoot
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) onClose();
      }}
      containerClassName={`interfold-dialog power-tray ${className}`}
      overlayClassName="power-tray-overlay"
      onEscapeKeyDown={(event) => {
        if (pending) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (pending) event.preventDefault();
      }}
      onOpenAutoFocus={(event) => {
        if (initialFocusRef?.current) {
          event.preventDefault();
          initialFocusRef.current.focus({ preventScroll: true });
        }
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        triggerRef.current?.focus({ preventScroll: true });
      }}
    >
      <div className="power-tray-header">
        {onBack && (
          <button type="button" className="power-tray-back" aria-label={backLabel} disabled={pending} onClick={onBack}>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <path
                d="m12 5-5 5 5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{backLabel}</span>
          </button>
        )}
        <DialogHeader className="power-tray-title" title={title} />
        <button type="button" className="power-tray-icon" aria-label="Close" disabled={pending} onClick={onClose}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
            <path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {/* Disclosures drive the layout directly, so the surface and its controls move in the same frame. */}
      <DialogContent className="power-tray-content">{children}</DialogContent>
    </DialogRoot>
  );
}
