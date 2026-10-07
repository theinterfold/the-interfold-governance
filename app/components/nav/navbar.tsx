import WalletContainer from "@/components/WalletContainer";
import { plugins } from "@/plugins";
import Link from "next/link";
import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { FaucetStrip } from "./faucetStrip";
import { MobileNavDialog } from "./mobileNavDialog";
import { NavLink, type INavLink } from "./navLink";
import { SiteHeaderChrome, HeaderWordmark, InterfoldSymbol } from "@/vendor/site-header";
import { Cross as Hamburger } from "hamburger-react";

export const Navbar: React.FC = () => {
  const [showMenu, setShowMenu] = useState(false);
  const reducedMotion = useReducedMotion();

  const navLinks: INavLink[] = plugins.map((p) => ({
    id: p.id,
    name: p.title,
    path: `/plugins/${p.id}/#/`,
  }));

  return (
    <>
      <SiteHeaderChrome
        className="governance-header sticky top-0 z-[var(--hub-navbar-z-index)] select-none bg-[var(--page-ground-shade)]"
        extendedBrand={true}
        brand={
          <Link href="/" aria-label="The Interfold Governance home" className="site-header-brand">
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
            <div className="site-header-action">
              <WalletContainer />
            </div>
          </>
        }
      />
      <FaucetStrip />

      {/* Keep the menu trigger above the full-screen mobile menu. */}
      <div className="site-header-menu-trigger interfold-mobile-menu-trigger">
        <Hamburger
          toggled={showMenu}
          toggle={setShowMenu}
          direction="right"
          size={28}
          distance="sm"
          duration={reducedMotion ? 0 : 0.35}
          color="var(--site-header-ink)"
          rounded={true}
          label={showMenu ? "Close menu" : "Open menu"}
        />
      </div>
      <MobileNavDialog open={showMenu} navLinks={navLinks} onOpenChange={setShowMenu} />
    </>
  );
};
