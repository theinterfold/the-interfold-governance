import WalletContainer from "@/components/WalletContainer";
import { plugins } from "@/plugins";
import classNames from "classnames";
import Link from "next/link";
import { useState } from "react";
import { MobileNavDialog } from "./mobileNavDialog";
import { NavLink, type INavLink } from "./navLink";
import { AvatarIcon, Button, IconType, Spinner } from "@aragon/ods";
import { PUB_APP_NAME, PUB_ENABLE_FAUCET, PUB_PROJECT_LOGO } from "@/constants";
import { useFaucet } from "@/hooks/useFaucet";
import { If } from "@/components/if";
import { useAlerts } from "@/context/Alerts";

export const Navbar: React.FC = () => {
  const [showMenu, setShowMenu] = useState(false);

  const { addAlert } = useAlerts();

  const navLinks: INavLink[] = [
    { path: "/", id: "home", name: "Home" /*, icon: IconType.APP_DASHBOARD*/ },
    ...plugins.map((p) => ({
      id: p.id,
      name: p.title,
      path: `/plugins/${p.id}/#/`,
      // icon: p.icon,
    })),
  ];

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
      <nav className="sticky top-0 z-[var(--hub-navbar-z-index)] w-full select-none border-b border-b-[var(--mint-line)] bg-[var(--mint)]">
        <div className="mx-auto grid h-[63px] w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 md:px-6">
          {/* Wordmark */}
          <Link
            href="/"
            className={classNames(
              "justify-self-start",
              "outline-none focus:outline-none focus-visible:ring focus-visible:ring-primary focus-visible:ring-offset"
            )}
          >
            <img src={PUB_PROJECT_LOGO} className="h-[17px] w-auto shrink-0" alt={PUB_APP_NAME + " logo"} />
          </Link>

          {/* Small center mark (decorative twin of the wordmark, so hidden from readers) */}
          <Link
            href="/"
            aria-hidden="true"
            tabIndex={-1}
            className="hidden justify-self-center opacity-90 transition-opacity hover:opacity-100 md:block"
          >
            <img src="/interfold-symbol-on-mint.png" className="h-[35px] w-auto" alt="" />
          </Link>

          {/* Links + actions */}
          <div className="col-start-3 flex items-center gap-x-2 justify-self-end lg:gap-x-5">
            <ul className="hidden items-center gap-x-8 md:flex">
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

            {/* Nav Trigger */}
            <button
              onClick={() => setShowMenu(true)}
              className={classNames(
                "rounded-full border border-neutral-100 bg-neutral-0 p-1 md:hidden",
                "outline-none focus:outline-none focus-visible:ring focus-visible:ring-primary focus-visible:ring-offset"
              )}
            >
              <AvatarIcon size="lg" icon={IconType.MENU} />
            </button>
          </div>
        </div>
      </nav>
      <MobileNavDialog open={showMenu} navLinks={navLinks} onOpenChange={setShowMenu} />
    </>
  );
};
