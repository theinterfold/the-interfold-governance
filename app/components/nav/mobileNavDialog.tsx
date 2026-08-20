import { Dialog, type IDialogRootProps } from "@aragon/ods";
import Link from "next/link";
import { NavLink, type INavLink } from "./navLink";
import { PUB_PROJECT_URL } from "@/constants";

interface IMobileNavDialogProps extends IDialogRootProps {
  navLinks: INavLink[];
}

export const MobileNavDialog: React.FC<IMobileNavDialogProps> = (props) => {
  const { navLinks, ...dialogRootProps } = props;

  return (
    <Dialog.Root {...dialogRootProps}>
      <Dialog.Content className="flex flex-col gap-y-6 px-3 py-7">
        <ul className="flex w-full flex-col gap-y-1">
          {navLinks.map((navLink) => (
            <NavLink {...navLink} key={navLink.id} onClick={() => dialogRootProps.onOpenChange?.(false)} />
          ))}
        </ul>
        <div className="flex items-center justify-between px-4">
          <div className="flex w-full justify-center">
            <Link
              href={PUB_PROJECT_URL}
              className="rounded-xl outline-none focus-visible:ring focus-visible:ring-primary focus-visible:ring-offset"
            >
              <span className="flex items-center gap-x-2 py-2 pl-3 pr-4">
                <img src="/theinterfold-logo.png" height="24" width="24" alt="Interfold Governance" />
                Interfold Governance
              </span>
            </Link>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
};
