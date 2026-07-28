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
    { path: "/", id: "dashboard", name: "Dashboard" /*, icon: IconType.APP_DASHBOARD*/ },
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
      <nav className="h-30 sticky top-0 z-[var(--hub-navbar-z-index)] flex w-full select-none items-center justify-center border-b border-b-neutral-800 bg-neutral-50">
        <div className="w-full max-w-[1280px] flex-col gap-2 p-3 md:px-6 md:pb-0 lg:gap-3">
          <div className="flex w-full items-center justify-between">
            <div className="pb-3 lg:ml-10">
              <Link
                href="/"
                className={classNames(
                  "flex items-center gap-x-5 rounded-full py-2 md:rounded-lg",
                  "outline-none focus:outline-none focus-visible:ring focus-visible:ring-primary focus-visible:ring-offset" // focus styles
                )}
              >
                <img src={PUB_PROJECT_LOGO} width="200" className="shrink-0" alt={PUB_APP_NAME + " logo"} />
                {/* <span className="text-md leading-tight text-neutral-500">Secret ballots demo on</span>
                <img src="/logo-aragon-text.svg" alt="Aragon" className="h-6" /> */}
              </Link>
              <div className="flex items-center gap-x-2"></div>
            </div>

            <div className="flex items-center gap-x-2">
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
                  "outline-none focus:outline-none focus-visible:ring focus-visible:ring-primary focus-visible:ring-offset" // focus styles
                )}
              >
                <AvatarIcon size="lg" icon={IconType.MENU} />
              </button>
            </div>
          </div>

          {/* Tab wrapper */}
          <ul className="hidden gap-x-10 md:flex lg:pl-10">
            {navLinks.map(({ id, name, path }) => (
              <NavLink name={name} path={path} id={id} key={id} />
            ))}
          </ul>
        </div>
      </nav>
      <MobileNavDialog open={showMenu} navLinks={navLinks} onOpenChange={setShowMenu} />
    </>
  );
};
