import { GovernHeroArtwork } from "@/components/governHero";
import styles from "@/components/governHero.module.css";
import { ScrollFadeIn } from "@/vendor/site-header/motion";

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
              Commit FOLD, activate voting power, and take part in decisions about how Interfold evolves.
            </ScrollFadeIn>
          </div>
        </section>
        <ScrollFadeIn as="section" className={styles.story} aria-labelledby="home-voting-heading" amount="some">
          <h2 id="home-voting-heading" className={styles.storyTitle}>
            Private votes.
            <br />
            Verifiable results.
          </h2>
          <div>
            <p>
              CRISP secret ballots keep individual choices private and make votes harder to buy or coerce. The community
              can verify the final tally.
            </p>
            <div className={styles.participation}>
              <h3>How to participate</h3>
              <p>
                Delegate your FOLD to yourself to activate voting power. Then explore proposals and take part in the
                decisions you care about.
              </p>
            </div>
          </div>
        </ScrollFadeIn>
      </div>
    </section>
  );
}
