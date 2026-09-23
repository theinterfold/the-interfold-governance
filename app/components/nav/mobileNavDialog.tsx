import { useEffect, useRef } from "react";
import Link from "next/link";
import { type IDialogRootProps } from "@aragon/ods";
import { type INavLink } from "./navLink";
import { PUB_PROJECT_URL } from "@/constants";
import { useRouter } from "next/router";
import WalletContainer from "@/components/WalletContainer";

interface IMobileNavDialogProps extends IDialogRootProps {
  navLinks: INavLink[];
}

/**
 * The marketing site's mobile menu, not a modal card: a full-screen mint field
 * with a MENU label at the top and the destinations set large and centred, each
 * fading up in turn. Sizes are theinterfold.com's own — Gramercy at
 * `min(56px, (100vw - 94px) / 6.91)` over 0.95, tracked -1.08px.
 *
 * The overlay sits at z-60 so it covers the navbar; the burger is lifted to
 * z-70 in navbar.tsx so it stays reachable to close.
 */
export const MobileNavDialog: React.FC<IMobileNavDialogProps> = (props) => {
  const { navLinks, open, onOpenChange } = props;
  const { query } = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Freeze the page at its existing scroll position, including on mobile Safari.
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const scrollY = window.scrollY;
    const previous = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow,
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange?.(false);
      if (e.key !== "Tab") return;
      const controls = [
        ...Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []),
        document.querySelector<HTMLElement>(".interfold-mobile-menu-trigger [role='button']"),
      ].filter((item): item is HTMLElement => !!item);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
    const desktop = window.matchMedia("(min-width: 1280px)");
    const onDesktop = () => {
      if (desktop.matches) onOpenChange?.(false);
    };
    desktop.addEventListener("change", onDesktop);
    return () => {
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      document.body.style.overflow = previous.overflow;
      document.documentElement.style.overflow = previous.htmlOverflow;
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onDesktop);
      window.scrollTo(0, scrollY);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const titleBase =
    "interfold-menu-item font-[family-name:var(--font-serif)] capitalize tracking-[-1.08px] transition-colors hover:text-[var(--accent-hover)]";
  // The site caps the size but lets it shrink with the viewport so the longest
  // label always holds one line.
  const titleStyle = {
    fontSize: "min(56px, calc((100vw - 94px) / 6.91))",
    lineHeight: 0.95,
  };

  const close = () => onOpenChange?.(false);

  return (
    <div
      ref={dialogRef}
      className="interfold-mobile-menu-overlay fixed inset-0 z-[60] flex w-full flex-col items-center justify-center overflow-hidden bg-[var(--mint)] xl:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <p
        className="interfold-menu-item absolute top-6 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[1px] text-[var(--muted)]"
        style={{ animationDelay: "0ms" }}
      >
        Menu
      </p>

      <div className="flex w-full flex-col items-center gap-y-2 px-6">
        {navLinks.map((navLink, i) => (
          <Link
            key={navLink.id}
            href={navLink.path}
            aria-current={query.id === navLink.id ? "page" : undefined}
            onClick={close}
            className={`${titleBase} text-[var(--accent)]`}
            style={{
              ...titleStyle,
              // The site drops word-spacing by -0.1em, but sets its one two-word
              // label without it — at this size it eats 4px of a 6.76px space and
              // "Voting power" reads as a single word.
              wordSpacing: navLink.name.includes(" ") ? "normal" : "-0.1em",
              animationDelay: `${80 + i * 80}ms`,
            }}
          >
            {navLink.name}
          </Link>
        ))}

        <Link
          href={PUB_PROJECT_URL}
          onClick={close}
          // Carries the titles' size and is told apart by colour alone, as on the site.
          className={`${titleBase} text-[var(--muted-2)]`}
          style={{ ...titleStyle, wordSpacing: "normal", animationDelay: `${80 + navLinks.length * 80}ms` }}
        >
          {/* Labelled by destination: this goes to theinterfold.com, not to
              governance — the same mislabel the footer carried. */}
          The Interfold
        </Link>
        <div className="mt-10">
          <WalletContainer />
        </div>
      </div>
    </div>
  );
};
