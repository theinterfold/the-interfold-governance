import { useEffect, useState } from "react";
import { PROOF_STAGES } from "@crisp-e3/sdk";
import type { ProofStage } from "@crisp-e3/sdk";
import { ActionIcon } from "@/components/input/actionIcon";
import { BallotDisclosure } from "@/components/proposalVoting/ballotDisclosure";
import {
  estimateRemainingMs,
  formatRemaining,
  proofStageLabel,
  type ProofProgressState,
} from "../../utils/proofProgress";
import styles from "../networkProgress.module.css";

const stateLabels = { complete: "Complete", current: "Current", pending: "Pending" };
type StageState = keyof typeof stateLabels;

/**
 * The ballot proof's stages, what each proves, and the time left, in the network-progress style.
 * Collapsed by default to the count, the time left, the current stage's text and the track, which
 * stay visible either way; the full list opens on demand.
 */
export function ProofStages({ progress }: { progress: ProofProgressState }) {
  const { isMask, stageStartedAt } = progress;
  const current = stageStartedAt.length - 1;

  // Re-render every second so the estimate counts down between stage changes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = estimateRemainingMs(progress, now);
  const stages = PROOF_STAGES.map((stage, index): { stage: ProofStage; state: StageState } => ({
    stage,
    state: index < current ? "complete" : index === current ? "current" : "pending",
  }));

  return (
    <BallotDisclosure
      className={styles.network}
      title={(chevron) => (
        <span className={styles.summary}>
          <span className={styles.meta}>
            <span>
              Proof {current + 1} of {PROOF_STAGES.length}
            </span>
            <span aria-live="polite">
              {remaining === undefined ? "Estimating time left…" : formatRemaining(remaining)}
            </span>
          </span>
          <span className={styles.current}>
            <span className={styles.indicator} aria-hidden="true" />
            <strong key={current} className="vp-label-change">
              {proofStageLabel(PROOF_STAGES[current], isMask)}
            </strong>
            <span className={styles.chevron}>{chevron}</span>
          </span>
          <span className={styles.track} aria-hidden="true">
            {stages.map(({ stage, state }) => (
              <span key={stage} data-state={state} />
            ))}
          </span>
        </span>
      )}
    >
      <div className={styles.body}>
        <ol className={styles.steps} aria-label="Ballot proof stages">
          {stages.map(({ stage, state }, index) => (
            <li key={stage} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className={styles.marker} aria-hidden="true">
                {state === "complete" ? <ActionIcon name="check" /> : String(index + 1).padStart(2, "0")}
              </span>
              <span className={styles.label}>{proofStageLabel(stage, isMask)}</span>
              <span className={styles.state}>{stateLabels[state]}</span>
            </li>
          ))}
        </ol>
      </div>
    </BallotDisclosure>
  );
}
