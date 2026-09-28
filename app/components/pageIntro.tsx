import type { ReactNode } from "react";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { PageIntroGlyph, type PageIntroGlyphKind } from "./pageIntroGlyph";

export function PageIntro({
  title,
  titleId,
  description,
  glyph,
  actions,
}: {
  title: string;
  titleId?: string;
  description: ReactNode;
  glyph?: PageIntroGlyphKind;
  actions?: ReactNode;
}) {
  return (
    <header className="governance-page-intro">
      {glyph && (
        <ScrollFadeIn>
          <PageIntroGlyph kind={glyph} />
        </ScrollFadeIn>
      )}
      <ScrollFadeIn as="h1" id={titleId}>
        {title}
      </ScrollFadeIn>
      <ScrollFadeIn as="p" className="governance-page-intro-copy">
        {description}
      </ScrollFadeIn>
      {actions && <ScrollFadeIn className="governance-page-intro-actions">{actions}</ScrollFadeIn>}
    </header>
  );
}
