import classNames from "classnames";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ParsedUrlQuery } from "querystring";
import { resolveQueryParam } from "@/utils/query";
import { Icon, type IconType } from "@aragon/ods";

export interface INavLink {
  path: string;
  id: string;
  name: string;
  icon?: IconType;
}

interface INavLinkProps extends INavLink {
  onClick?: () => void;
}

export const NavLink: React.FC<INavLinkProps> = (props) => {
  const { icon, id, name, path, onClick } = props;
  const { pathname, query } = useRouter();
  const pluginId = resolvePluginId(pathname, query);

  const isHome = path === "/";
  const isPluginPathname = pathname === "/plugins/[id]";

  let selected;
  if (isHome) {
    // strict comparison for home page
    selected = pathname === path;
  } else if (isPluginPathname) {
    // compare resolved pluginId from query params with plugin id
    selected = pluginId === id;
  } else {
    // check if current path starts with tab path so that
    // the nav item is selected when the user is on a nested page
    selected = pathname.startsWith(path);
  }

  // The shared header owns the active underline, inset to the link's text.
  const containerClasses = "group relative flex items-center";

  const anchorClasses = classNames(
    // `interfold-top-nav-link` owns the horizontal padding on purpose — the
    // underline insets by the same custom property, so the two cannot drift.
    "site-header-link interfold-top-nav-link",
    { "is-active": selected }
  );

  return (
    <li key={id} className={containerClasses}>
      <Link href={path} onClick={onClick} aria-current={selected ? "page" : undefined} className={anchorClasses}>
        {icon != null && (
          <Icon
            icon={icon}
            size="md"
            className={classNames("text-neutral-300 group-hover:text-neutral-800 lg:hidden", {
              "text-neutral-800": selected,
            })}
          />
        )}
        <span>{name}</span>
      </Link>
    </li>
  );
};

/**
 * Resolves the plugin ID from the given pathname and query parameters.
 *
 * @param pathname - The current pathname.
 * @param queryParams - The parsed query parameters.
 * @returns The resolved plugin ID or null if the pathname is not "/plugins/[id]"
 * or the ID is not found in the query parameters.
 */
function resolvePluginId(pathname: string, queryParams: ParsedUrlQuery): string | null {
  if (pathname !== "/plugins/[id]") return null;

  return resolveQueryParam(queryParams.id) || null;
}
