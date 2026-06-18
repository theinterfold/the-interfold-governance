import { Button } from "@aragon/ods";
import { useAccount } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import Link from "next/link";
import { plugins } from "@/plugins";
import { PUB_CRISP_INFO_URL } from "@/constants";

export default function StandardHome() {
  const { isConnected } = useAccount();
  const { open } = useWeb3Modal();

  const proposalsHref = `/plugins/${plugins[0]?.id ?? "proposals"}/#/`;

  return (
    <section className="mint-slab">
      <div className="mx-auto w-full max-w-screen-xl px-6 py-20">
        {/* Serif marquee hero */}
        <div className="serif-hero">
          <div className="rail">
            <span className="num">№ 01</span>
            <span className="vline" />
            <span className="label">
              Public &
              <br />
              private
            </span>
          </div>
          <h1>
            Govern in the <span className="ital">open</span>, or by{" "}
            <span className="strike">
              traceable
              <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                <path d="M2,16 Q60,4 120,10 T198,6" />
              </svg>
            </span>{" "}
            secret ballot.
          </h1>
        </div>

        {/* Lede + protocol notes */}
        <div className="hero-body-grid">
          <div />
          <p className="lede">
            <span className="dropcap">T</span>he Interfold is the governance home of the FOLD DAO, built on the Aragon
            OSx stack. Open a public proposal and let the community vote transparently on-chain, or open a private one —
            ballots are encrypted in your browser and a committee of independent ciphernodes tallies them with CRISP,
            without ever exposing an individual vote.
          </p>
          <ul className="em-list self-center">
            <li>Public, on-chain tallies</li>
            <li>Private, encrypted ballots</li>
            <li>No trusted tallier</li>
            <li>Voting power in FOLD</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="mt-14 flex flex-wrap items-center gap-3">
          {!isConnected && (
            <Button size="lg" variant="primary" onClick={() => open()}>
              Connect wallet
            </Button>
          )}
          <Link href={proposalsHref}>
            <Button size="lg" variant={isConnected ? "primary" : "tertiary"}>
              View proposals
            </Button>
          </Link>
          <a href={PUB_CRISP_INFO_URL} target="_blank" rel="noreferrer" className="hero-text-link">
            Learn how private voting works →
          </a>
        </div>
      </div>
    </section>
  );
}
