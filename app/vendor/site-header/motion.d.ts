import type { ReactNode, CSSProperties } from "react";

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
  children: string;
  isExternal?: boolean;
  isHovered: boolean;
  textClassName: string;
  arrowClassName?: string;
  animateInView?: boolean;
};

export declare function HoverArrowContent(props: HoverArrowContentProps): ReactNode;

export type ArrowSlideProps = {
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
