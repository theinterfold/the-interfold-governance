import { BallotDisclosure } from "@/components/proposalVoting/ballotDisclosure";
import { ActionIcon } from "@/components/input/actionIcon";
import type { E3Lifecycle } from "../utils/e3Lifecycle";
import styles from "./networkProgress.module.css";

const stepLabels = { complete: "Complete", current: "Current", pending: "Pending", unknown: "Unconfirmed" };

export function NetworkProgress({ progress }: { progress: E3Lifecycle }) {
  const currentStep = progress.currentStep;
  const active = currentStep !== undefined && !progress.published;
  return (
    <BallotDisclosure
      className={styles.network}
      title={(chevron) => (
        <span className={styles.summary}>
          <span className={styles.meta}>
            <span>Network progress</span>
            {currentStep !== undefined && (
              <span>
                Step {currentStep} of {progress.steps.length}
              </span>
            )}
          </span>
          <span className={styles.current}>
            {active ? (
              <span className={styles.indicator} aria-hidden="true" />
            ) : progress.published ? (
              <ActionIcon name="check" />
            ) : (
              <ActionIcon name="clock" />
            )}
            <strong key={progress.phase} className="vp-label-change">
              {progress.phase}
            </strong>
            {active && <span className={styles.currentLabel}>Current stage</span>}
            <span className={styles.chevron}>{chevron}</span>
          </span>
          {currentStep !== undefined && (
            <span className={styles.track} aria-hidden="true">
              {progress.steps.map((step) => (
                <span key={step.label} data-state={step.state} />
              ))}
            </span>
          )}
        </span>
      )}
    >
      <div className={styles.body}>
        <p className={styles.description}>{progress.description}</p>
        <ol className={styles.steps} aria-label="Encrypted tally stages">
          {progress.steps.map((step, index) => (
            <li key={step.label} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
              <span className={styles.marker} aria-hidden="true">
                {step.state === "complete" ? <ActionIcon name="check" /> : String(index + 1).padStart(2, "0")}
              </span>
              <span className={styles.label}>{step.label}</span>
              <span className={styles.state}>{stepLabels[step.state]}</span>
            </li>
          ))}
        </ol>
      </div>
    </BallotDisclosure>
  );
}
