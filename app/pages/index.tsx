import { GovernHeroArtwork } from "@/components/governHero";
import Link from "next/link";
import styles from "@/components/governHero.module.css";
import { ScrollFadeIn, SiteCtaLink } from "@/vendor/site-header/motion";

export default function StandardHome() {
  return (
    <section className="governance-home" style={{ overflow: "clip" }}>
      <div className="page-content">
        <section className={styles.hero} aria-labelledby="governance-hero-title">
          <GovernHeroArtwork />
          <div className={styles.copy}>
            <ScrollFadeIn as="h1" id="governance-hero-title" className={styles.title}>
              Private votes.
              <br />
              Collective direction.
            </ScrollFadeIn>
            <ScrollFadeIn as="p" className={styles.support}>
              Participate in decisions about the network.
            </ScrollFadeIn>
            <ScrollFadeIn className={styles.actions}>
              <SiteCtaLink as={Link} href="/plugins/proposals/#/">
                Explore proposals
              </SiteCtaLink>
              <SiteCtaLink as={Link} href="/plugins/lock/#/" variant="secondary">
                Manage voting power
              </SiteCtaLink>
            </ScrollFadeIn>
          </div>
        </section>
        <ScrollFadeIn as="section" className={styles.story} aria-labelledby="home-voting-heading" amount="some">
          <h2 id="home-voting-heading" className={styles.storyTitle}>
            Private votes.
            <br />
            Verifiable results.
          </h2>
          <div className={styles.storyCopy}>
            <p>
              Private ballots keep your choice confidential while the community can verify the final result. Explore
              proposals and use your FOLD voting power to help shape the network.
            </p>
            <p>
              Before you vote, review the proposed changes and what they mean for the network. Once voting closes,
              follow the result and the next steps in the proposal.
            </p>
          </div>
        </ScrollFadeIn>
      </div>
    </section>
  );
}
