import { useState, type ReactNode, type RefObject } from "react";
import { DialogContent } from "@aragon/ods";
import { Title } from "@radix-ui/react-dialog";
import { MorphDialog } from "@/components/motion/MorphDialog";

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
  overlayClassName?: string;
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
  overlayClassName,
  children,
}: Props) {
  return (
    <MorphDialog
      triggerRef={triggerRef}
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) onClose();
      }}
      containerClassName={`interfold-dialog power-tray ${className}`}
      overlayClassName={overlayClassName}
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
        if (triggerRef.current) {
          event.preventDefault();
          triggerRef.current.focus({ preventScroll: true });
        }
      }}
    >
      <div className="power-tray-header">
        <button
          type="button"
          className="power-tray-back"
          data-visible={!!onBack}
          aria-hidden={!onBack}
          tabIndex={onBack ? undefined : -1}
          aria-label={backLabel}
          disabled={pending || !onBack}
          onClick={onBack}
        >
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
        <TrayTitle title={title} />
        <button type="button" className="power-tray-icon" aria-label="Close" disabled={pending} onClick={onClose}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
            <path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {/* Disclosures drive the layout directly, so the surface and its controls move in the same frame. */}
      <DialogContent className="power-tray-content">{children}</DialogContent>
    </MorphDialog>
  );
}

/** Keep the heading on the same timeline as the outgoing and incoming panels. */
function TrayTitle({ title }: { title: string }) {
  const [words, setWords] = useState({ current: title, previous: "" });
  if (words.current !== title) setWords({ current: title, previous: words.current });
  return (
    <Title className="power-tray-title" aria-label={title}>
      {words.previous && (
        <span key={`out-${words.previous}`} aria-hidden="true" className="power-tray-title-out">
          {words.previous}
        </span>
      )}
      <span
        key={words.current}
        data-dialog-title-current=""
        className={words.previous ? "power-tray-title-in" : undefined}
      >
        {words.current}
      </span>
    </Title>
  );
}
