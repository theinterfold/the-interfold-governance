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

  // The desktop rule is drawn by `.interfold-top-nav-link::after` (globals.css,
  // copied from theinterfold.com) rather than a border on this element: the site
  // insets the line to the link's own padding so it matches the width of the WORD,
  // and animates it in. A border-b here would run the full padded box.
  const containerClasses = "group relative";

  const anchorClasses = classNames(
    // `interfold-top-nav-link` owns the horizontal padding on purpose — the
    // underline insets by the same custom property, so the two cannot drift.
    "interfold-top-nav-link inline-flex items-center gap-3 text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]",
    { "is-active": selected },
    "outline-none focus-visible:ring focus-visible:ring-primary focus-visible:ring-offset"
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
        <span
          className={classNames(
            // Desktop matches the marketing site's nav exactly: Gramercy at 22px,
            // sentence case, -0.66px tracking, with the governance ink palette.
            // NOT `truncate`: it carries overflow:hidden, and at 22px/1.05 the line box is
            // 23px against 32px of type — which sliced 4px off the bottom, i.e. the
            // descender of the "g" in "Voting power". The marketing site lets its nav
            // links run wide instead of clipping them.
            // The site's mobile menu is Gramercy too (-1.08px at 36px = the same -0.03em),
            // not a small uppercase label — so the burger menu reads like the bar it replaces.
            "flex-1 whitespace-nowrap text-[22px] leading-[1.05] tracking-[-0.03em] transition-colors",
            "xl:tracking-[-0.66px]",
            "text-[var(--accent)] group-hover:text-[var(--accent-hover)]"
          )}
        >
          {name}
        </span>
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
