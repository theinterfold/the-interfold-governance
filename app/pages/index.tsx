import Link from "next/link";
import { plugins } from "@/plugins";
import { PUB_CRISP_INFO_URL, PUB_GET_FOLD_URL } from "@/constants";

export default function StandardHome() {
  const proposalsHref = `/plugins/${plugins[0]?.id ?? "proposals"}/#/`;
  // The lock page is one of the main ways a FOLD holder can actually participate —
  // surface it here rather than only on the Voting Power page.
  const votingPowerHref = `/plugins/${plugins.find((p) => p.id === "lock" || p.id === "members")?.id ?? "lock"}/#/`;

  return (
    <section className="mint-slab">
      {/* max-w-[1440px] px-4/md:px-6 — the navbar/footer's own container, not
          max-w-screen-xl (1280px): at 1440px wide that put the hero 80px to the
          right of the wordmark sitting directly above it. */}
      <div className="mx-auto w-full max-w-[1440px] px-4 py-20 md:px-6">
        {/* Serif marquee hero */}
        <div className="serif-hero">
          <h1>Interfold Governance</h1>
          <p className="hero-sub">
            Commit FOLD, activate voting power, and take part in decisions about how Interfold evolves.
          </p>
        </div>

        {/* Action first, explanation second: the path into governance. */}
        <div className="mt-14">
          {/* No second Connect here. The navbar already carries the wallet control at
              all times, and it is the one that also shows the connected address — two
              connect buttons a screen apart read as two different actions. The three
              cards below are this page's actions. */}
          <div className="step-strip">
            <div className="step-track">
              <span className="step-num">01</span>
              <a href={PUB_GET_FOLD_URL} target="_blank" rel="noreferrer" className="step">
                <div className="step-media">
                  {/* Plain img on purpose: these are decorative keyvis files already
                  exported at 900px webp for a 451px slot, the CSS box reserves
                  their ratio so nothing shifts, and next/image would put the
                  optimizer route in front of three static assets. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/get-fold.webp" alt="" width={900} height={678} loading="lazy" />
                </div>
                <div className="step-body">
                  <span className="step-title">Get FOLD ↗</span>
                  <span className="step-desc">Acquire FOLD on Uniswap.</span>
                </div>
              </a>
            </div>
            <div className="step-track">
              <span className="step-num">02</span>
              <Link href={votingPowerHref} className="step">
                <div className="step-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/activate-voting-power.webp" alt="" width={900} height={678} loading="lazy" />
                </div>
                <div className="step-body">
                  <span className="step-title">Activate voting power →</span>
                  <span className="step-desc">Lock FOLD and delegate it to activate governance weight.</span>
                </div>
              </Link>
            </div>
            <div className="step-track">
              <span className="step-num">03</span>
              <Link href={proposalsHref} className="step">
                <div className="step-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/govern.webp" alt="" width={900} height={678} loading="lazy" />
                </div>
                <div className="step-body">
                  <span className="step-title">Govern →</span>
                  <span className="step-desc">Vote on proposals. Eligible voters can also create proposals.</span>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Lede */}
        <div className="hero-body-grid mt-12">
          <p className="lede">
            Interfold governance covers protocol changes, parameters, and other DAO decisions. IPPs use{" "}
            <a href={PUB_CRISP_INFO_URL} target="_blank" rel="noreferrer" className="lede-link">
              CRISP
            </a>{" "}
            for receipt-free secret-ballot voting, keeping individual choices private while producing a verifiable
            result.
          </p>
          <ul className="em-list self-center">
            <li>Protocol decisions — help shape how Interfold evolves</li>
            <li>Secret ballots — individual votes remain private</li>
            <li>Receipt-free voting — votes are harder to coerce or buy</li>
            <li>Verifiable outcome — the final tally can be verified</li>
          </ul>
        </div>

        <div className="mt-8">
          <a href={PUB_CRISP_INFO_URL} target="_blank" rel="noreferrer" className="hero-text-link">
            Learn how secret ballots work →
          </a>
        </div>
      </div>
    </section>
  );
}
