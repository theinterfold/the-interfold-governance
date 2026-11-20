import Head from "next/head";
import { PUB_APP_NAME } from "@/constants";
import type { ReactNode } from "react";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { PageIntroGlyph, type PageIntroGlyphKind } from "./pageIntroGlyph";

export function PageIntro({
  title,
  titleId,
  focusOnNavigation = false,
  description,
  glyph,
  actions,
}: {
  title: string;
  titleId?: string;
  focusOnNavigation?: boolean;
  description: ReactNode;
  glyph?: PageIntroGlyphKind;
  actions?: ReactNode;
}) {
  return (
    <header className="governance-page-intro">
      <Head><title>{`${title} · ${PUB_APP_NAME}`}</title></Head>
      {glyph && (
        <ScrollFadeIn>
          <PageIntroGlyph kind={glyph} />
        </ScrollFadeIn>
      )}
      <ScrollFadeIn
        as="h1"
        id={titleId}
        {...(focusOnNavigation ? { tabIndex: -1, "data-proposal-ready": true } : {})}
      >
        {title}
      </ScrollFadeIn>
      <ScrollFadeIn as="p" className="governance-page-intro-copy">
        {description}
      </ScrollFadeIn>
      {actions && <ScrollFadeIn className="governance-page-intro-actions">{actions}</ScrollFadeIn>}
    </header>
  );
}
