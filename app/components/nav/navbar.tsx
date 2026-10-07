import WalletContainer from "@/components/WalletContainer";
import { plugins } from "@/plugins";
import Link from "next/link";
import { useState } from "react";
import { MobileNavDialog } from "./mobileNavDialog";
import { NavLink, type INavLink } from "./navLink";
import { Button, Spinner } from "@aragon/ods";
import { PUB_ENABLE_FAUCET } from "@/constants";
import { useFaucet } from "@/hooks/useFaucet";
import { If } from "@/components/if";
import { SiteHeaderChrome, HeaderWordmark, InterfoldSymbol } from "@/vendor/site-header";
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
      <SiteHeaderChrome
        className="governance-header sticky top-0 z-[var(--hub-navbar-z-index)] select-none bg-[var(--page-ground-shade)]"
        extendedBrand={true}
        brand={
          <Link
            href="/"
            aria-label="The Interfold Governance home"
            className="site-header-brand outline-none focus-visible:ring focus-visible:ring-primary focus-visible:ring-offset"
          >
            <HeaderWordmark governance={true} />
          </Link>
        }
        symbol={
          <Link href="/" aria-hidden="true" tabIndex={-1} className="site-header-symbol">
            <InterfoldSymbol />
          </Link>
        }
        navigation={
          <>
            <ul className="site-header-links">
              {navLinks.map(({ id, name, path }) => (
                <NavLink name={name} path={path} id={id} key={id} />
              ))}
            </ul>
            <If true={PUB_ENABLE_FAUCET}>
              <div className="site-header-action">
                <Button className="btn-mint" onClick={claimTestTokens} disabled={isConfirming} title={blockedReason}>
                  {isConfirming ? <Spinner size="sm" /> : "Faucet"}
                </Button>
              </div>
            </If>
            <div className="site-header-action">
              <WalletContainer />
            </div>
          </>
        }
      />

      {/* Keep the menu trigger above the full-screen mobile menu. */}
      <div className="site-header-menu-trigger interfold-mobile-menu-trigger">
        <Hamburger
          toggled={showMenu}
          toggle={setShowMenu}
          direction="right"
          size={28}
          distance="sm"
          duration={0.35}
          color="var(--site-header-ink)"
          rounded={true}
          label={showMenu ? "Close menu" : "Open menu"}
        />
      </div>
      <MobileNavDialog open={showMenu} navLinks={navLinks} onOpenChange={setShowMenu} />
    </>
  );
};
