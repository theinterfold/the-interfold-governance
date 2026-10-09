import { PowerInfoArrow } from "./powerInfoArrow";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Popper from "@radix-ui/react-popper";
import { Portal } from "@radix-ui/react-portal";
import { Presence } from "@radix-ui/react-presence";
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import { usePopoverGroup } from "@/components/motion/usePopoverGroup";

export function PowerInfo({
  label,
  compact = false,
  layout = "stacked",
  trigger,
  disabled = false,
  contentClassName = "",
  children,
  interactive = false,
}: {
  label: string;
  compact?: boolean;
  layout?: "stacked" | "columns";
  trigger?: ReactNode;
  disabled?: boolean;
  contentClassName?: string;
  children: ReactNode;
  interactive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const previewContent = useRef<HTMLDivElement>(null);
  const claimPopover = usePopoverGroup(popoverId, () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    // A dialog still needs its source button for the return journey.
    if (!previewContent.current?.querySelector("[data-morph-source]")) setOpen(false);
  });
  const keepPreviewOpen = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    claimPopover();
    setOpen(true);
  };
  const enterPreview = () => {
    claimPopover();
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(keepPreviewOpen, 140);
  };
  const leavePreview = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      const content = previewContent.current;
      if (!content?.querySelector("[data-morph-source]") && !content?.contains(document.activeElement)) setOpen(false);
    }, 180);
  };
  useEffect(
    () => () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    },
    []
  );
  const openOnPointerDown = useRef(false);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  if (interactive)
    return (
      <Popper.Root>
        <Popper.Anchor asChild={true}>
          <button
            ref={previewTrigger}
            type="button"
            className="power-preview-trigger"
            disabled={disabled}
            aria-label={label}
            aria-expanded={open && !disabled}
            aria-controls={popoverId}
            aria-haspopup="dialog"
            onPointerEnter={enterPreview}
            onPointerLeave={leavePreview}
            onClick={keepPreviewOpen}
            onKeyDown={(event) => {
              if (["ArrowDown", "Enter", " "].includes(event.key)) {
                event.preventDefault();
                keepPreviewOpen();
                requestAnimationFrame(() =>
                  previewContent.current?.querySelector<HTMLButtonElement>("button")?.focus()
                );
              }
            }}
          >
            {trigger}
          </button>
        </Popper.Anchor>
        <Portal>
          <Presence present={open && !disabled}>
            <DismissableLayer
              asChild={true}
              onDismiss={() => setOpen(false)}
              onEscapeKeyDown={() => previewTrigger.current?.focus()}
              onInteractOutside={(event) => {
                if (
                  previewContent.current?.querySelector("[data-morph-source]") ||
                  (event.target instanceof Element &&
                    (event.target.closest(".morph-dialog") || previewTrigger.current?.contains(event.target)))
                )
                  event.preventDefault();
              }}
            >
              <Popper.Content
                ref={previewContent}
                onPointerEnter={keepPreviewOpen}
                onPointerLeave={leavePreview}
                id={popoverId}
                role="dialog"
                aria-label={label}
                className={`power-info-popover ${contentClassName}`}
                data-state={open && !disabled ? "open" : "closed"}
                aria-hidden={!open || disabled}
                side="bottom"
                align="start"
                arrowPadding={12}
                sideOffset={8}
                collisionPadding={16}
              >
                {children}
                <Popper.Arrow asChild={true} className="power-info-arrow" width={14} height={7}>
                  <PowerInfoArrow />
                </Popper.Arrow>
              </Popper.Content>
            </DismissableLayer>
          </Presence>
        </Portal>
      </Popper.Root>
    );

  return (
    <Tooltip.Provider delayDuration={180}>
      <Tooltip.Root open={open && !disabled} onOpenChange={setOpen}>
        <Tooltip.Trigger
          type="button"
          className={
            trigger ? "power-preview-trigger" : `power-info-toggle${compact ? " power-info-toggle--compact" : ""}`
          }
          disabled={disabled}
          aria-label={label}
          aria-expanded={open}
          onPointerDown={() => {
            openOnPointerDown.current = open;
          }}
          onClick={(event) => {
            // Radix dismisses tooltips on click by default; allow tap and keyboard toggling too.
            event.preventDefault();
            setOpen(event.detail === 0 ? !open : !openOnPointerDown.current);
          }}
        >
          {trigger ?? (
            <svg
              viewBox="0 0 24 24"
              width={compact ? 16 : 24}
              height={compact ? 16 : 24}
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
              <path d="M12 11v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="12" cy="7.5" r=".9" fill="currentColor" />
            </svg>
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className={`power-info-popover${compact ? " power-info-popover--compact" : ""}${layout === "columns" ? " power-info-popover--columns" : ""} ${contentClassName}`}
            side={compact ? "top" : "bottom"}
            align="center"
            arrowPadding={12}
            sideOffset={8}
            collisionPadding={16}
          >
            {children}
            <Tooltip.Arrow asChild={true} className="power-info-arrow" width={14} height={7}>
              <PowerInfoArrow />
            </Tooltip.Arrow>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
