import { Button } from "@aragon/ods";
import { useAccount } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import Link from "next/link";
import { plugins } from "@/plugins";
import { PUB_CRISP_INFO_URL, PUB_GET_FOLD_URL } from "@/constants";

const CIPHERNODES_URL = "https://docs.theinterfold.com/ciphernode-operators";

export default function StandardHome() {
  const { isConnected } = useAccount();
  const { open } = useWeb3Modal();

  const proposalsHref = `/plugins/${plugins[0]?.id ?? "proposals"}/#/`;
  // The lock page is one of the main ways a FOLD holder can actually participate —
  // surface it here rather than only on the Voting Power page.
  const votingPowerHref = `/plugins/${plugins.find((p) => p.id === "lock" || p.id === "members")?.id ?? "lock"}/#/`;

  return (
    <section className="mint-slab">
      <div className="mx-auto w-full max-w-screen-xl px-6 py-20">
        {/* Serif marquee hero */}
        <div className="serif-hero">
          <h1>
            Govern in <span className="ital">public</span>, or by{" "}
            <span className="strike">
              traceable
              <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                <path d="M2,16 Q60,4 120,10 T198,6" />
              </svg>
            </span>{" "}
            secret ballot.
          </h1>
        </div>

        {/* Action first, explanation second: the path into governance. */}
        <div className="mt-14">
          {!isConnected && (
            <div className="mb-8">
              <Button size="lg" variant="primary" onClick={() => open()}>
                Connect wallet
              </Button>
            </div>
          )}
          <div className="step-strip">
            <a href={PUB_GET_FOLD_URL} target="_blank" rel="noreferrer" className="step">
              <span className="step-title">Get FOLD ↗</span>
              <span className="step-desc">Acquire FOLD on Uniswap.</span>
            </a>
            <span className="step-arrow" aria-hidden="true">
              →
            </span>
            <Link href={votingPowerHref} className="step">
              <span className="step-title">Activate voting power →</span>
              <span className="step-desc">Lock FOLD and delegate it to activate governance weight.</span>
            </Link>
            <span className="step-arrow" aria-hidden="true">
              →
            </span>
            <Link href={proposalsHref} className="step">
              <span className="step-title">Govern →</span>
              <span className="step-desc">Vote on proposals. Eligible voters can also create proposals.</span>
            </Link>
          </div>
        </div>

        {/* Lede */}
        <div className="hero-body-grid mt-12">
          <div />
          <p className="lede">
            <span className="dropcap">T</span>he Interfold DAO supports public onchain voting and private voting with{" "}
            <a href={PUB_CRISP_INFO_URL} target="_blank" rel="noreferrer" className="lede-link">
              CRISP
            </a>
            . Public votes and tallies are visible onchain, while private ballots are encrypted in your browser and
            computed under encryption, with only the final tally threshold-decrypted by a committee of{" "}
            <a href={CIPHERNODES_URL} target="_blank" rel="noreferrer" className="lede-link">
              ciphernodes
            </a>
            . Individual votes are never exposed or traceable.
          </p>
          <ul className="em-list self-center">
            <li>Public proposals: votes and tallies visible onchain</li>
            <li>Private proposals: ballots remain encrypted</li>
            <li>No trusted tallier: only the final result is decrypted</li>
            <li>FOLD voting power: voting weight comes from committed FOLD</li>
          </ul>
        </div>

        <div className="mt-8">
          <a href={PUB_CRISP_INFO_URL} target="_blank" rel="noreferrer" className="hero-text-link">
            Learn how private voting works →
          </a>
        </div>
      </div>
    </section>
  );
}
