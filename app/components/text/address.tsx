import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Popper from "@radix-ui/react-popper";
import { Portal } from "@radix-ui/react-portal";
import { Presence } from "@radix-ui/react-presence";
import { MemberAvatar } from "@aragon/ods";
import { isAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { PUB_CHAIN } from "@/constants";
import { formatHexString } from "@/utils/evm";
import { blockieDataUrl } from "@/utils/blockies";
import { getChildrenText } from "@/utils/content";
import { useMemberName } from "@/hooks/useMemberName";
import { usePopoverGroup } from "@/components/motion/usePopoverGroup";

/** The shared wallet identity, with details on hover, focus or tap. */
export const AddressText = ({
  children,
  bold = true,
  asLink = true,
  label,
  withAddress = false,
}: {
  children: ReactNode;
  bold?: boolean;
  /** False inside an existing link: keep a passive hover target, without nested controls. */
  asLink?: boolean;
  /** Preserve a resolved ENS name or contextual label while keeping the wallet details. */
  label?: ReactNode;
  /** Keep a name and its compact address inside one hover, focus and tap target. */
  withAddress?: boolean;
}) => {
  const address = getChildrenText(children).trim();
  const { address: connectedAddress } = useAccount();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const contentId = useId();
  const claimPopover = usePopoverGroup(contentId, () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setOpen(false);
  });
  const valid = isAddress(address, { strict: false });
  const formattedAddress = formatHexString(address);
  const isYourWallet = valid && address.toLowerCase() === connectedAddress?.toLowerCase();
  const stacked = withAddress && !!label && !isYourWallet;
  const triggerClass = `wallet-identity-trigger${stacked ? " wallet-identity-trigger--stacked" : ""}${isYourWallet ? " wallet-identity-trigger--own" : ""} ${bold ? "font-semibold" : ""}`;
  const triggerContent = isYourWallet ? (
    <>
      <span className="wallet-identity-primary">{formattedAddress}</span>
      <span className="wallet-identity-tag">Your wallet</span>
    </>
  ) : stacked ? (
    <>
      <span className="wallet-identity-primary">{label}</span>
      <span className="wallet-identity-secondary">
        {address.slice(0, 10)}…{address.slice(-8)}
      </span>
    </>
  ) : (
    (label ?? formattedAddress)
  );

  const keepOpen = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    claimPopover();
    setOpen(true);
  };
  const enter = () => {
    claimPopover();
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(keepOpen, 140);
  };
  const scheduleClose = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (
        !triggerRef.current?.contains(document.activeElement) &&
        !contentRef.current?.contains(document.activeElement)
      )
        setOpen(false);
    }, 180);
  };

  useEffect(
    () => () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !contentRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (contentRef.current?.contains(document.activeElement)) triggerRef.current?.querySelector("button")?.focus();
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  if (!valid) return <span>{label ?? formattedAddress}</span>;

  return (
    <Popper.Root>
      <Popper.Anchor asChild={true}>
        <span
          ref={triggerRef}
          className="wallet-identity"
          onMouseEnter={enter}
          onMouseLeave={scheduleClose}
          onFocus={keepOpen}
          onBlur={scheduleClose}
        >
          {asLink ? (
            <button
              type="button"
              className={triggerClass}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? contentId : undefined}
              onClick={(event) => {
                event.stopPropagation();
                keepOpen();
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                keepOpen();
                requestAnimationFrame(() => contentRef.current?.querySelector("button")?.focus());
              }}
            >
              {triggerContent}
            </button>
          ) : (
            <span className={triggerClass}>{triggerContent}</span>
          )}
        </span>
      </Popper.Anchor>
      <Portal>
        <Presence present={open}>
          <Popper.Content
            ref={contentRef}
            id={contentId}
            role="dialog"
            aria-label="Wallet details"
            className="wallet-identity-card"
            data-state={open ? "open" : "closed"}
            aria-hidden={!open}
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            onMouseEnter={keepOpen}
            onMouseLeave={scheduleClose}
            onFocus={keepOpen}
            onBlur={scheduleClose}
            onClick={(event) => event.stopPropagation()}
          >
            <WalletDetails address={address as Address} />
          </Popper.Content>
        </Presence>
      </Portal>
    </Popper.Root>
  );
};

/** ENS is resolved only when the card is opened, using the directory's shared cache. */
function WalletDetails({ address }: { address: Address }) {
  const ensName = useMemberName(address);
  const { address: connectedAddress } = useAccount();
  const isYou = address.toLowerCase() === connectedAddress?.toLowerCase();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const explorer = PUB_CHAIN.blockExplorers?.default;

  return (
    <>
      <div className="wallet-identity-card-heading">
        <MemberAvatar src={blockieDataUrl(address) ?? ""} address={address} alt="" size="sm" />
        <div>
          <strong>{ensName ?? "Wallet"}</strong>
          <span>{isYou ? `Your wallet · ${PUB_CHAIN.name}` : PUB_CHAIN.name}</span>
        </div>
      </div>
      <code className="wallet-identity-address">{address}</code>
      <div className="wallet-identity-actions">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address);
              setCopyState("copied");
            } catch {
              setCopyState("failed");
            }
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V4H4v12h4" />
          </svg>
          {copyState === "copied" ? "Copied" : "Copy address"}
        </button>
        {explorer && (
          <a href={`${explorer.url}/address/${address}`} target="_blank" rel="noopener noreferrer">
            View on explorer ↗
          </a>
        )}
      </div>
      <span className={copyState === "failed" ? "wallet-identity-copy-error" : "sr-only"} role="status">
        {copyState === "copied"
          ? "Address copied"
          : copyState === "failed"
            ? "Couldn’t copy. Select the address above to copy it."
            : ""}
      </span>
    </>
  );
}
