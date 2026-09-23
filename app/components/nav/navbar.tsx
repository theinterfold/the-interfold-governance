import WalletContainer from "@/components/WalletContainer";
import { plugins } from "@/plugins";
import classNames from "classnames";
import Link from "next/link";
import { useState } from "react";
import { MobileNavDialog } from "./mobileNavDialog";
import { NavLink, type INavLink } from "./navLink";
import { Button, Spinner } from "@aragon/ods";
import { PUB_ENABLE_FAUCET } from "@/constants";
import { useFaucet } from "@/hooks/useFaucet";
import { If } from "@/components/if";
import { InterfoldSymbol } from "@/components/InterfoldSymbol";
import { Cross as Hamburger } from "hamburger-react";
import { useAlerts } from "@/context/Alerts";

export const Navbar: React.FC = () => {
  const [showMenu, setShowMenu] = useState(false);

  const { addAlert } = useAlerts();

  const navLinks: INavLink[] = plugins.map((p) => ({
    id: p.id,
    name: p.title,
    path: `/plugins/${p.id}/#/`,
  }));

  const { claim, canClaim, blockedReason, isConfirming } = useFaucet();

  // The faucet tops up per token; blockedReason mirrors its own revert conditions
  // so a repeat click explains itself instead of burning a reverting transaction.
  const claimTestTokens = () => {
    if (!canClaim) {
      addAlert(blockedReason ?? "Cannot claim from the faucet right now");
      return;
    }
    claim();
  };

  return (
    <>
      {/* One 63px bar, theinterfold.com-style: wordmark left, small mark center, links right. */}
      <nav className="sticky top-0 z-[var(--hub-navbar-z-index)] w-full select-none bg-[var(--mint-shade)]">
        <div className="mx-auto grid h-[60px] w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 xl:h-[63px]">
          {/* Wordmark */}
          <Link
            href="/"
            className={classNames(
              "justify-self-start",
              "outline-none focus:outline-none focus-visible:ring focus-visible:ring-primary focus-visible:ring-offset"
            )}
          >
            {/* Live type, not a bitmap: the marketing site sets the wordmark in
                Gramercy at 22px / -0.66px, so it stays crisp and picks up the
                same ink hover tone as every other link. */}
            <span
              className="whitespace-nowrap font-[family-name:var(--font-serif)] text-[18px] capitalize leading-[1.05] tracking-[-0.66px] text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)] md:text-[22px]"
              style={{ fontFeatureSettings: '"liga" 1, "clig" 1', fontVariantLigatures: "common-ligatures" }}
            >
              The Interfold
            </span>
          </Link>

          {/* Small center mark (decorative twin of the wordmark, so hidden from readers) */}
          <Link
            href="/"
            aria-hidden="true"
            tabIndex={-1}
            className="h-7 w-8 justify-self-center text-[var(--accent)] transition-colors duration-200 hover:text-[var(--accent-hover)] focus-visible:text-[var(--accent-hover)] xl:h-[35px] xl:w-[46px]"
          >
            <InterfoldSymbol className="block h-full w-full" />
          </Link>

          {/* Links + actions */}
          <div className="col-start-3 hidden items-center gap-x-4 justify-self-end xl:flex">
            {/* Match the main site's desktop breakpoint and 32px between words. */}
            <ul className="hidden items-center gap-0 xl:flex">
              {navLinks.map(({ id, name, path }) => (
                <NavLink name={name} path={path} id={id} key={id} />
              ))}
            </ul>
            <If true={PUB_ENABLE_FAUCET}>
              <div className="shrink-0">
                <Button className="btn-mint" onClick={claimTestTokens} disabled={isConfirming} title={blockedReason}>
                  {isConfirming ? <Spinner size="sm" /> : "Faucet"}
                </Button>
              </div>
            </If>
            <div className="shrink-0">
              <WalletContainer />
            </div>
          </div>
        </div>
      </nav>

      {/* Outside <nav> on purpose. The bar is `sticky z-10`, which makes it a stacking
          context — a z-70 child of it still resolves inside z-10 and lands under the
          z-60 overlay, leaving Escape as the only way out of the menu. As a sibling it
          really is on top. Same control and props as theinterfold.com's own trigger
          (hamburger-react `Cross`, right, 28, sm, 0.35s, Interfold Black, rounded) — no pill,
          no border, just the bars. */}
      <div className="interfold-mobile-menu-trigger fixed right-6 top-7 z-[70] h-4 w-7 -translate-y-1/2 xl:hidden">
        <Hamburger
          toggled={showMenu}
          toggle={setShowMenu}
          direction="right"
          size={28}
          distance="sm"
          duration={0.35}
          color="var(--ink)"
          rounded={true}
          label={showMenu ? "Close menu" : "Open menu"}
        />
      </div>
      <MobileNavDialog open={showMenu} navLinks={navLinks} onOpenChange={setShowMenu} />
    </>
  );
};
