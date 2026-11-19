import WalletContainer from "@/components/WalletContainer";
import { plugins } from "@/plugins";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type AnchorHTMLAttributes } from "react";
import { FaucetStrip } from "./faucetStrip";
import { MobileNavDialog } from "./mobileNavDialog";
import { NavLink, type INavLink } from "./navLink";
import { SiteHeaderChrome, SiteHeaderMenuButton } from "@/vendor/site-header";

// Router adapter only; identity markup and animation belong to the shared header.
const HeaderHomeLink = (props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <Link {...props} />;

const desktopQuery = "(min-width: 1280px)";
function subscribeWidth(notify: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const isDesktop = () => window.matchMedia(desktopQuery).matches;

export const Navbar: React.FC = () => {
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (window.takeGovernMenuIntent?.()) setShowMenu(true);
  }, []);

  const desktop = useSyncExternalStore(subscribeWidth, isDesktop, () => true);
  const navLinks: INavLink[] = plugins.map((p) => ({
    id: p.id,
    name: p.title,
    path: `/plugins/${p.id}/#/`,
  }));

  return (
    <>
      <SiteHeaderChrome
        className="governance-header sticky top-0 z-[var(--hub-navbar-z-index)] select-none bg-[var(--page-ground-shade)]"
        governance
        HomeLink={HeaderHomeLink}
        navigation={
          <>
            <ul className="site-header-links">
              {navLinks.map(({ id, name, path }) => (
                <NavLink name={name} path={path} id={id} key={id} />
              ))}
            </ul>
            <div className="site-header-action">
              {desktop && <WalletContainer />}
            </div>
          </>
        }
      />
      <FaucetStrip />

      {/* Keep the menu trigger above the full-screen mobile menu. */}
      <SiteHeaderMenuButton action={!desktop && <WalletContainer placement="mobile" />} id="governance-mobile-controls" open={showMenu} onOpenChange={setShowMenu} />
      <MobileNavDialog open={showMenu} navLinks={navLinks} onOpenChange={setShowMenu} />
    </>
  );
};
