import { useState } from "react";
import classNames from "classnames";
import CrispCreate from "@/plugins/crispVoting/pages/new";
import TokenCreate from "@/plugins/tokenVoting/pages/new";

type Kind = "private" | "public";

/**
 * Single create entry point. Secret ballot (CRISP) is the normal path; the
 * transparent on-chain body exists only as a fallback when a secret ballot
 * cannot run, so the toggle is not two equal modes.
 */
export default function CreateProposal() {
  const [kind, setKind] = useState<Kind>("private");

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 md:px-6">
        <div className="kicker mb-3">Governance</div>
        <div className="chips">
          <button
            type="button"
            className={classNames("chip", { on: kind === "private" })}
            onClick={() => setKind("private")}
          >
            Secret ballot
          </button>
          <button
            type="button"
            className={classNames("chip", { on: kind === "public" })}
            onClick={() => setKind("public")}
          >
            Transparent fallback
          </button>
        </div>
        <p className="mt-3 text-sm leading-normal text-neutral-500">
          {kind === "private"
            ? "The standard path. Ballots are encrypted in the browser with CRISP and tallied without revealing individual votes, so the outcome is verifiable while each choice stays private."
            : "Fallback only, for when a secret ballot cannot run. Every vote and the running tally are visible on-chain, weighted by FOLD voting power — individual choices are not private."}
        </p>
      </div>

      {kind === "private" ? <CrispCreate /> : <TokenCreate />}
    </>
  );
}
