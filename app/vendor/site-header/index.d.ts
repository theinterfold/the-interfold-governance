import type { AnchorHTMLAttributes, ComponentType, CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";

/** Run after the server-rendered header and menu trigger, before application scripts. */
export declare const HEADER_ENTRANCE_BOOTSTRAP: string;

export interface SiteFooterLinkGroup {
  title: string;
  links: readonly { label: string; href: string }[];
}

export interface SiteFooterProps {
  /** Main-site origin for apps whose legal pages live on the main website. */
  siteUrl?: string;
  background?: string;
  /** Content for the two shared link columns; defaults to the main site's links. */
  linkGroups?: readonly [SiteFooterLinkGroup, SiteFooterLinkGroup];
  /** The main site includes Updates; applications may omit the newsletter. */
  showUpdates?: boolean;
  copyright?: string;
  /** Application-owned entrance animation; footer layout and styles stay shared. */
  Reveal?: ComponentType<{ children: ReactNode; delay?: number; className?: string }>;
}
export declare function SiteFooter(props: SiteFooterProps): React.JSX.Element;
export declare function GhostSignupForm(props: { className?: string }): React.JSX.Element;
export declare const INTERFOLD_OUTLINE_RATIO: number;
export declare const INTERFOLD_SYMBOL_ASPECT_RATIO: number;

export interface BendingChevronProps {
  /** Omit for native details, select, or an accordion trigger that owns its state. */
  open?: boolean;
  width?: number | string;
  thickness?: number | string;
  className?: string;
  style?: CSSProperties;
}
export declare function BendingChevron(props: BendingChevronProps): React.JSX.Element;
export declare function useMobileMenuBehavior(open: boolean, onOpenChange?: (open: boolean) => void): React.RefObject<HTMLDivElement>;

export interface SiteHeaderChromeProps extends HTMLAttributes<HTMLElement> {
  variant?: "desktop" | "mobile" | "responsive";
  /** Shared composition; the optional local study URL can compare the same layouts in both apps. */
  layout?: "current" | "lockup" | "compact" | "divided";
  /** Identity artwork and motion are owned here; apps only supply routing and events. */
  governance?: boolean;
  homeHref?: string;
  HomeLink?: ElementType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;
  brandLinkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className" | "href">;
  symbolLinkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className" | "href">;
  navigation?: ReactNode;
  navigationLabel?: string;
  extendedBrand?: boolean;
}
export interface HeaderWordmarkProps {
  governance?: boolean;
}
export declare function SiteHeaderChrome(
  props: SiteHeaderChromeProps,
): React.JSX.Element;
export declare function HeaderWordmark(
  props: HeaderWordmarkProps,
): React.JSX.Element;
export declare function InterfoldSymbol(props: {
  className?: string;
  animated?: boolean;
  lockup?: boolean;
}): React.JSX.Element;
export interface SiteHeaderMenuButtonProps {
  /** Application control that stays beside the menu toggle in both menu states. */
  action?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "mobile" | "responsive";
  className?: string;
  id?: string;
}
export declare function SiteHeaderMenuButton(props: SiteHeaderMenuButtonProps): React.JSX.Element;
