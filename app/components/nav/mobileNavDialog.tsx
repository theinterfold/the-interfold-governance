import { useMobileMenuBehavior } from "@/vendor/site-header";
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
  const dialogRef = useMobileMenuBehavior(!!open, onOpenChange);

  if (!open) return null;

  const titleBase =
    "site-header-menu-link interfold-menu-item font-[family-name:var(--font-serif)] capitalize tracking-[-1.08px] transition-colors";
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
      className="interfold-mobile-menu-overlay fixed inset-0 z-[60] flex w-full flex-col items-center justify-center overflow-hidden bg-[var(--page-ground)] xl:hidden"
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
            className={`${titleBase} site-header-menu-primary`}
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
        {/* Hand off to the wallet dialog instead of leaving the menu above it. */}
        <div className="mt-10" onClick={close}>
          <WalletContainer />
        </div>
      </div>
    </div>
  );
};
