import { Button } from "@aragon/ods";
import { useAccount } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import Link from "next/link";
import { plugins } from "@/plugins";
import { PUB_CRISP_INFO_URL, PUB_GET_FOLD_URL } from "@/constants";

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
          <h1>Interfold Governance</h1>
          <p className="hero-sub">
            Commit FOLD, activate voting power, and take part in decisions about how Interfold evolves.
          </p>
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
            <span className="dropcap">I</span>nterfold governance covers protocol changes, parameters, and other DAO
            decisions. IPPs use{" "}
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
