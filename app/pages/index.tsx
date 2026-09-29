import Link from "next/link";
import { PageIntro } from "@/components/pageIntro";
import { PointIllustration } from "@/components/pointIllustration";
import type { PointIllustrationName } from "@/utils/pointLoop";
import { ArrowSlide, ScrollFadeIn, UnderlinedArrowLink } from "@/vendor/site-header/motion";
import { plugins } from "@/plugins";
import { PUB_CRISP_INFO_URL, PUB_GET_FOLD_URL } from "@/constants";

function HomeStep({
  href,
  title,
  description,
  image,
  external = false,
  animated = false,
}: {
  href: string;
  title: string;
  description: string;
  image: PointIllustrationName;
  external?: boolean;
  animated?: boolean;
}) {
  return (
    <ScrollFadeIn className="step-track">
      <Link
        href={href}
        className="step group"
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        <div className="step-media">
          <PointIllustration image={image} animated={animated} />
        </div>
        <div className="step-body">
          <h2 className="step-title">
            <span>{title}</span>
            <ArrowSlide isExternal={external} className="home-link-arrow" rowClassName="home-link-arrow-row" />
          </h2>
          <p className="step-desc">{description}</p>
        </div>
      </Link>
    </ScrollFadeIn>
  );
}

export default function StandardHome() {
  const proposalsHref = `/plugins/${plugins[0]?.id ?? "proposals"}/#/`;
  // The lock page is one of the main ways a FOLD holder can actually participate —
  // surface it here rather than only on the Voting Power page.
  const votingPowerHref = `/plugins/${plugins.find((p) => p.id === "lock" || p.id === "members")?.id ?? "lock"}/#/`;

  return (
    <section className="governance-home">
      <div className="page-content">
        <PageIntro
          title="Interfold Governance"
          description="Commit FOLD, activate voting power, and take part in decisions about how Interfold evolves."
        />

        {/* Action first, explanation second: the path into governance. */}
        <div>
          {/* No second Connect here. The navbar already carries the wallet control at
              all times, and it is the one that also shows the connected address — two
              connect buttons a screen apart read as two different actions. The two
              cards below are this page's actions. */}
          <div className="step-strip">
            {/* Keep the SVG posters only until loop startup is optimized. */}
            <HomeStep
              href={votingPowerHref}
              title="Activate voting power"
              image="activate-voting-power"
              description="Lock FOLD to vote yourself or choose a delegate."
            />
            <HomeStep
              href={proposalsHref}
              title="Govern"
              image="govern"
              description="Explore proposals, cast your vote and follow the results."
            />
          </div>
          <ScrollFadeIn className="home-token-link">
            <span>Need FOLD?</span>
            <UnderlinedArrowLink
              href={PUB_GET_FOLD_URL}
              className="home-learn-link"
              textClassName="home-link-label"
              arrowClassName="home-link-arrow"
              arrowRowClassName="home-link-arrow-row"
              underlineClassName="home-link-underline"
            >
              Get FOLD on Uniswap
            </UnderlinedArrowLink>
          </ScrollFadeIn>
        </div>

        <section aria-labelledby="home-voting-heading">
          <ScrollFadeIn className="home-voting-note">
            <h2 id="home-voting-heading" className="home-voting-note-title">
              Private votes.
              <br />
              Verifiable results.
            </h2>
            <div className="home-voting-note-copy">
              <p>
                CRISP secret ballots keep individual choices private and make votes harder to buy or coerce. The
                community can verify the final tally.
              </p>
              <UnderlinedArrowLink
                href={PUB_CRISP_INFO_URL}
                className="hero-text-link home-learn-link"
                textClassName="home-link-label"
                arrowClassName="home-link-arrow"
                arrowRowClassName="home-link-arrow-row"
                underlineClassName="home-link-underline"
              >
                How secret ballots work
              </UnderlinedArrowLink>
            </div>
          </ScrollFadeIn>
        </section>
      </div>
    </section>
  );
}
