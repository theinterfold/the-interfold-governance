import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Popper from "@radix-ui/react-popper";
import { Portal } from "@radix-ui/react-portal";
import { Presence } from "@radix-ui/react-presence";
import { Receipt } from "@phosphor-icons/react";
import { BendingChevron } from "@/vendor/site-header";
import { usePopoverGroup } from "@/components/motion/usePopoverGroup";

/** Transaction links stay attached to their confirmation without expanding its height. */
export function ReceiptPopover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const focusOnOpen = useRef(false);
  const cancelTimers = () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); };
  const dismiss = () => { cancelTimers(); setOpen(false); };
  const claim = usePopoverGroup(id, dismiss);
  const show = (focus = false) => {
    cancelTimers();
    claim();
    focusOnOpen.current = focus;
    setOpen(true);
    if (focus && open) content.current?.querySelector("a")?.focus();
  };
  const enter = () => {
    cancelTimers();
    openTimer.current = setTimeout(() => show(), 120);
  };
  const leave = () => {
    cancelTimers();
    closeTimer.current = setTimeout(() => {
      if (!trigger.current?.contains(document.activeElement) && !content.current?.contains(document.activeElement)) setOpen(false);
    }, 200);
  };
  useEffect(() => cancelTimers, []);
  useEffect(() => {
    if (!open) return;
    const focus = requestAnimationFrame(() => {
      if (focusOnOpen.current) content.current?.querySelector("a")?.focus();
      focusOnOpen.current = false;
    });
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !content.current?.contains(event.target as Node)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const ownsFocus = trigger.current?.contains(document.activeElement) || content.current?.contains(document.activeElement);
      dismiss();
      if (ownsFocus) trigger.current?.focus();
    };
    const outsideFocus = (event: FocusEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !content.current?.contains(event.target as Node)) dismiss();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("focusin", outsideFocus);
    return () => {
      cancelAnimationFrame(focus);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("focusin", outsideFocus);
    };
  }, [open]);
  return <Popper.Root>
    <Popper.Anchor asChild>
      <button ref={trigger} type="button" className="ui-success-receipts-trigger" aria-label="Mask transactions" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onPointerEnter={event => { if (event.pointerType === "mouse") enter(); }} onPointerLeave={event => { if (event.pointerType === "mouse") leave(); }} onClick={() => show(true)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); show(true); } }}>
        <span className="ui-receipt-label"><Receipt size={18} aria-hidden="true" />Transactions</span><BendingChevron open={open}/>
      </button>
    </Popper.Anchor>
    <Portal><Presence present={open}>
      <Popper.Content ref={content} id={id} role="dialog" aria-label="Mask transactions" aria-hidden={!open} align="end" sideOffset={8} collisionPadding={16} className="delegate-sort-menu ui-choice-menu mask-transaction-popover" data-state={open ? "open" : "closed"} onPointerEnter={event => { if (event.pointerType === "mouse") cancelTimers(); }} onPointerLeave={event => { if (event.pointerType === "mouse") leave(); }}>
        {children}
      </Popper.Content>
    </Presence></Portal>
  </Popper.Root>;
}
