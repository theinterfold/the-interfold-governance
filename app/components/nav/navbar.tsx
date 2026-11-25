import WalletContainer from "@/components/WalletContainer";
import { plugins } from "@/plugins";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
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
  const [walletRequestUrl, setWalletRequestUrl] = useState<string | null>(null);
  const { events } = useRouter();
  const { status } = useAccount();

  useEffect(() => {
    const intent = window.takeGovernHeaderIntent?.();
    if (intent === "menu") setShowMenu(true);
    if (intent === "wallet") setWalletRequestUrl(window.location.href);
  }, []);

  // ConnectKit closes its modal on mount and when a restored account connects.
  // Deliver the user's click after those effects, using the current wallet control.
  useEffect(() => {
    if (!walletRequestUrl || status === "reconnecting" || status === "connecting") return;
    setWalletRequestUrl(null);
    if (walletRequestUrl === window.location.href) {
      document.querySelector<HTMLButtonElement>("button.interfold-header-wallet")?.click();
    }
  }, [walletRequestUrl, status]);

  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    events.on("routeChangeStart", close);
    events.on("hashChangeStart", close);
    window.addEventListener("popstate", close);
    window.addEventListener("hashchange", close);
    return () => {
      events.off("routeChangeStart", close);
      events.off("hashChangeStart", close);
      window.removeEventListener("popstate", close);
      window.removeEventListener("hashchange", close);
    };
  }, [events, showMenu]);

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
