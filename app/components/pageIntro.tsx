import Head from "next/head";
import { PUB_APP_NAME } from "@/constants";
import type { ReactNode } from "react";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { PageIntroGlyph, type PageIntroGlyphKind } from "./pageIntroGlyph";

export function PageIntro({
  title,
  titleId,
  showPageTitle = true,
  focusOnNavigation = false,
  description,
  glyph,
  actions,
  immediate = false,
}: {
  title: string;
  titleId?: string;
  showPageTitle?: boolean;
  focusOnNavigation?: boolean;
  description: ReactNode;
  glyph?: PageIntroGlyphKind;
  actions?: ReactNode;
  immediate?: boolean;
}) {
  const Block = immediate ? "div" : ScrollFadeIn;
  const Heading = immediate ? "h1" : ScrollFadeIn;
  const Copy = immediate ? "p" : ScrollFadeIn;
  return (
    <header className="governance-page-intro">
      {showPageTitle && <Head><title>{`${title} · ${PUB_APP_NAME}`}</title></Head>}
      {glyph && (
        <Block>
          <PageIntroGlyph kind={glyph} />
        </Block>
      )}
      <Heading
        {...(immediate ? {} : { as: "h1" as const })}
        id={titleId}
        {...(focusOnNavigation ? { tabIndex: -1, "data-proposal-ready": true } : {})}
      >
        {title}
      </Heading>
      <Copy {...(immediate ? {} : { as: "p" as const })} className="governance-page-intro-copy">
        {description}
      </Copy>
      {actions && <Block className="governance-page-intro-actions">{actions}</Block>}
    </header>
  );
}
