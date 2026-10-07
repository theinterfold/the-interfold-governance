import { useId } from "react";
import { INTERFOLD_OUTLINE_RATIO, INTERFOLD_SYMBOL_ASPECT_RATIO } from "@/vendor/site-header";

export type PageIntroGlyphKind = "voting" | "proposals";

export function PageIntroGlyph({ kind }: { kind: PageIntroGlyphKind }) {
  const clipId = useId();
  const frontPaperMaskId = `${clipId}-front-paper`;
  // Match the navbar mark's rendered band, including its aspect-ratio fit.
  // The glyph can be larger without making its outlines heavier.
  const strokeWidth = `calc(min(var(--site-symbol-width), var(--site-symbol-height) * ${INTERFOLD_SYMBOL_ASPECT_RATIO}) * ${INTERFOLD_OUTLINE_RATIO})`;

  return (
    <svg
      className="page-intro-glyph"
      viewBox="0 0 44 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "voting" ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x="-8" y="-12" width="60" height="42" />
            </clipPath>
            {/* Hide rear outlines behind the front paper without adding a fill.
                The mask follows the same motion as the front paper. */}
            <mask id={frontPaperMaskId} maskUnits="userSpaceOnUse" x="-8" y="-12" width="60" height="60">
              <rect x="-8" y="-12" width="60" height="60" fill="white" stroke="none" />
              <g className="page-intro-ballot-paper page-intro-ballot-paper-2">
                <rect x="15" y="4" width="14" height="20" fill="black" stroke="none" />
              </g>
            </mask>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <g mask={`url(#${frontPaperMaskId})`}>
              {[1, 3].map((card) => (
                <g key={card} className={`page-intro-ballot-paper page-intro-ballot-paper-${card}`}>
                  <rect x="15" y="4" width="14" height="20" />
                </g>
              ))}
            </g>
            <g className="page-intro-ballot-paper page-intro-ballot-paper-2">
              <rect x="15" y="4" width="14" height="20" />
              <path d="m19.5 11 1.8 1.8 3.2-3.6" />
            </g>
          </g>
          <path d="M3 30h38" />
        </>
      ) : (
        <>
          <path d="M8 12v23h19M13 5h14l7 7v18H13Z" />
          <path d="M27 5v7h7" />
          <path className="page-intro-proposal-line" pathLength="1" d="M18 18h11" />
          <path className="page-intro-proposal-line" pathLength="1" d="M18 24h7" />
        </>
      )}
    </svg>
  );
}
