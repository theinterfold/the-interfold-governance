import type { ComponentType, CSSProperties, HTMLAttributes, ReactNode } from "react";

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
  brand: ReactNode;
  symbol: ReactNode;
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
}): React.JSX.Element;
