import { useState } from "react";
import classNames from "classnames";
import CrispCreate from "@/plugins/crispVoting/pages/new";
import TokenCreate from "@/plugins/tokenVoting/pages/new";

type Kind = "private" | "public";

/**
 * Single create entry point. The toggle selects which plugin the proposal is
 * created on — CRISP (private / encrypted ballots) or TokenVoting (public).
 * The privacy of a proposal is therefore determined by the plugin used.
 */
export default function CreateProposal() {
  const [kind, setKind] = useState<Kind>("private");

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 md:px-6">
        <div className="kicker mb-3">02 · Governance</div>
        <div className="chips">
          <button
            type="button"
            className={classNames("chip", { on: kind === "private" })}
            onClick={() => setKind("private")}
          >
            Private · CRISP
          </button>
          <button
            type="button"
            className={classNames("chip", { on: kind === "public" })}
            onClick={() => setKind("public")}
          >
            Public · Token
          </button>
        </div>
        <p className="mt-3 text-sm leading-normal text-neutral-500">
          {kind === "private"
            ? "Private proposals use CRISP: ballots are encrypted client-side and tallied by the Interfold committee without revealing individual votes."
            : "Public proposals use on-chain TokenVoting: every vote and the running tally are visible on-chain, weighted by FOLD voting power."}
        </p>
      </div>

      {kind === "private" ? <CrispCreate /> : <TokenCreate />}
    </>
  );
}
