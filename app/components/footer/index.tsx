import { PUB_APP_NAME, PUB_BLOG_URL, PUB_SOCIALS_URL, PUB_PROJECT_URL, PUB_CHAIN } from "@/constants";

/**
 * Laid out as theinterfold.com's DesktopFooter: a four-column grid under a tall
 * two-line wordmark, mono column headers, Gramercy links, and the mono baseline
 * row. Same links and same chain read as before — only the shape changed.
 */
export const Footer = () => {
  const year = new Date().getFullYear();

  // Gramercy at 22px / -0.66px, using an ink hover tone — the site's link voice.
  const linkClass =
    "block text-left font-[family-name:var(--font-serif)] text-[22px] leading-[1.05] tracking-[-0.66px] text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]";
  // Office Code Pro, 14px, +1.4px, uppercase — the site's column headers.
  const headerClass =
    "whitespace-nowrap font-[family-name:var(--font-mono)] text-[14px] uppercase leading-[1.075] tracking-[1.4px] text-[var(--accent)]";

  return (
    <footer className="relative w-full bg-[var(--mint-shade)]">
      <div className="mx-auto grid min-h-[312px] max-w-[1440px] grid-cols-1 gap-12 px-4 py-6 md:min-h-[412px] md:grid-cols-4 md:grid-rows-[1fr_auto] md:gap-x-8 md:gap-y-10 md:px-6">
        {/* The wordmark sits optically outdented and breaks across two lines, with
            the second line indented by the same amount — as on the marketing site. */}
        <div className="md:col-start-1 md:row-start-1">
          <p
            className="-ml-[8px] font-[family-name:var(--font-serif)] text-[40px] capitalize leading-[0.87] tracking-[-1.92px] text-[var(--accent)] md:-ml-[12px] md:text-[64px]"
            style={{ fontFeatureSettings: '"liga" 1, "clig" 1', fontVariantLigatures: "common-ligatures" }}
          >
            <span className="block">The</span>
            <span className="block pl-[8px] md:pl-[12px]">Interfold</span>
          </p>
        </div>

        <div className="md:col-start-3 md:row-start-1">
          <div className="flex flex-col gap-[8px]">
            {/* Was "Governance > Interfold Governance": the heading repeated the app's
                own name back at itself, and the link under it does not go to governance
                at all — it goes to theinterfold.com. Labelled by destination now. */}
            <p className={headerClass}>Elsewhere</p>
            <div>
              <a className={linkClass} href={PUB_PROJECT_URL} target="_blank" rel="noreferrer">
                The Interfold
              </a>
              <a className={linkClass} href={PUB_BLOG_URL} target="_blank" rel="noreferrer">
                Blog
              </a>
            </div>
          </div>
        </div>

        <div className="md:col-start-4 md:row-start-1">
          <div className="flex flex-col gap-[8px]">
            <p className={headerClass}>Follow us</p>
            <div>
              <a className={linkClass} href={PUB_SOCIALS_URL} target="_blank" rel="noreferrer">
                X
              </a>
            </div>
          </div>
        </div>

        <div className="font-[family-name:var(--font-mono)] text-[14px] uppercase leading-[1.075] tracking-[1.4px] text-[var(--accent)] md:col-start-1 md:row-start-2">
          <p>
            © {year} {PUB_APP_NAME}
          </p>
        </div>

        <div className="font-[family-name:var(--font-mono)] text-[14px] uppercase leading-[1.075] tracking-[1.4px] text-[var(--muted)] md:col-span-2 md:col-start-3 md:row-start-2">
          <p>Secret-ballot governance for the Interfold, on Aragon OSx — {PUB_CHAIN.name}</p>
        </div>
      </div>
    </footer>
  );
};
