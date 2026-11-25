import type { ReactNode, CSSProperties, ElementType } from "react";

export type SiteCtaLinkProps = {
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary";
  className?: string;
  /** A router link that forwards anchor properties; defaults to a native anchor. */
  as?: ElementType;
};
export declare function SiteCtaLink(props: SiteCtaLinkProps): ReactNode;

export type ScrollFadeInProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "section" | "header" | "h1" | "p";
  /** Use "some" for panels that can grow taller than the viewport. */
  amount?: number | "some" | "all";
  id?: string;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};
export declare function ScrollFadeIn(props: ScrollFadeInProps): ReactNode;
export declare function requestReveal(request: {
  node: Element;
  y: number;
  delayMs: number;
  spanMs: number;
  start: (delaySeconds: number) => void;
}): () => void;

export type HoverArrowContentProps = {
  children: ReactNode;
  isExternal?: boolean;
  isHovered: boolean;
  textClassName: string;
  arrowClassName?: string;
  /** Visible gap after the moving content. Omit to keep the original button spacing. */
  arrowGap?: number;
  /** Start-aligned links keep their content fixed and reveal the arrow to its right. */
  align?: "center" | "start";
  animateInView?: boolean;
};

export declare function HoverArrowContent(props: HoverArrowContentProps): ReactNode;

export type ArrowSlideProps = {
  /** Optional icon; uses the same rolling track as the website arrows. */
  children?: ReactNode;
  className?: string;
  rowClassName?: string;
  isExternal?: boolean;
};
export type UnderlinedArrowLinkProps = {
  children: string;
  className?: string;
  href: string;
  textClassName: string;
  arrowClassName?: string;
  arrowRowClassName?: string;
  underlineClassName?: string;
};
export declare function ArrowSlide(props: ArrowSlideProps): ReactNode;
export declare function ExternalArrowSlide(props: Omit<ArrowSlideProps, "isExternal">): ReactNode;
export declare function UnderlinedArrowLink(props: UnderlinedArrowLinkProps): ReactNode;

export type SiteDropdownPanelProps = {
  open: boolean;
  panelRef?: import("react").Ref<HTMLDivElement>;
  children: ReactNode;
  className?: string;
  id?: string;
  role?: string;
  "aria-label"?: string;
  onKeyDown?: import("react").KeyboardEventHandler<HTMLDivElement>;
};
export declare function SiteDropdownPanel(props: SiteDropdownPanelProps): ReactNode;
