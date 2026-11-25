import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { BallotPowerSummary } from "@/components/proposalVoting/ballotPowerSummary";
import type { PowerPresentation } from "@/components/proposalVoting/ballotPresentation";
import { useId, useRef, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { Shuffle } from "@phosphor-icons/react";
import { PowerShare } from "@/components/proposalVoting/privacyTools";
import { AnimatedAmount } from "@/components/motion/AnimatedAmount";
import { ActionButton } from "@/components/input/actionButton";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { compactNumber, displayNumber } from "@/utils/numbers";
import { ballotWeightPercentage, chooseBallotWeight, draftBallotWeight, type BallotWeight } from "../../utils/ballotWeight";

/** Edit the displayed percentage directly, or choose a fresh random weight beside it. */
export function VotingPowerAdjustment({
  mode,
  percentage,
  onModeChange,
  onPercentageChange,
  onRandomize,
  balance,
  balanceError,
}: {
  mode: "random" | "custom";
  percentage: string;
  onModeChange: (mode: "random" | "custom") => void;
  onPercentageChange: (percentage: string) => void;
  onRandomize: () => void;
  balance?: BallotWeight;
  balanceError?: string;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftChanged, setDraftChanged] = useState(false);
  const [editError, setEditError] = useState<string>();
  const [direction, setDirection] = useState<"up" | "down">("up");
  const custom = mode === "custom";
  const share = Number(percentage);
  const invalid = custom && (!Number.isInteger(share) || share < 1 || share > 100);
  const position = Number.isFinite(share) ? Math.min(100, Math.max(1, share)) : 100;
  const displayedShare = custom ? `${position}%` : balance ? ballotWeightPercentage(balance) : "100%";
  const numericShare = Number.parseFloat(displayedShare);
  const gesture = useRef<{ x: number; start: number; mode: "random" | "custom"; percentage: string; last: number; moved: boolean }>();
  const suppressClick = useRef(false);
  const beforeEdit = useRef({ mode, percentage });
  const scrub = useRef<HTMLButtonElement>(null);
  const restore = (previous: { mode: "random" | "custom"; percentage: string }) => {
    onModeChange(previous.mode);
    onPercentageChange(previous.percentage);
  };
  const beginEditing = () => {
    beforeEdit.current = { mode, percentage };
    setDraft(String(numericShare));
    setDraftChanged(false);
    setEditError(undefined);
    setEditing(true);
  };
  let amount: string | undefined;
  let error = editError ?? (invalid ? "Enter a whole percentage from 1% to 100%." : balanceError);
  if (!error && balance) {
    try {
      const counted = custom ? chooseBallotWeight(balance.available, false, share) : balance.counted;
      amount = displayNumber(formatUnits(counted * balance.unit, balance.decimals), 2);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "This percentage cannot be used for this round.";
    }
  }
  const changePercentage = (value: string) => {
    setDirection(Number(value) >= numericShare ? "up" : "down");
    onPercentageChange(value);
    onModeChange("custom");
  };
  const randomize = () => {
    if (!balance || balanceError) return;
    gesture.current = undefined;
    setDragging(false);
    setEditing(false);
    setEditError(undefined);
    onRandomize();
    onModeChange("random");
  };

  return (
    <div className="ballot-power-adjustment ballot-power-inline">
      <div className="ballot-power-summary" data-mode={mode} role="group" aria-label="Percentage and counted voting power">
        <div className="ballot-power-controls">
          <span className="ballot-power-scrub" data-dragging={dragging} data-editing={editing}>
            {editing ? (
              <label className="ballot-power-input">
                <input
                  ref={(element) => { if (element && document.activeElement !== element) { element.focus(); element.select(); } }}
                  type="number" min="1" max="100" step="1" inputMode="numeric"
                  aria-label="Voting power percentage"
                  aria-invalid={!!editError}
                  aria-describedby={error ? `${id}-error` : `${id}-hint`}
                  value={draft}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft(value);
                    setDraftChanged(true);
                    setEditError(undefined);
                    if (value !== "" && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100) changePercentage(value);
                  }}
                  onBlur={() => {
                    if (draftChanged && (draft === "" || !Number.isInteger(Number(draft)) || Number(draft) < 1 || Number(draft) > 100)) restore(beforeEdit.current);
                    setEditError(undefined);
                    setEditing(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      restore(beforeEdit.current);
                      setEditError(undefined);
                      setEditing(false);
                      requestAnimationFrame(() => scrub.current?.focus());
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      if (draftChanged && (draft === "" || !Number.isInteger(Number(draft)) || Number(draft) < 1 || Number(draft) > 100)) {
                        setEditError("Enter a whole percentage from 1% to 100%.");
                        return;
                      }
                      setEditing(false);
                      requestAnimationFrame(() => scrub.current?.focus());
                    }
                  }}
                />
                <span aria-hidden="true">%</span>
              </label>
            ) : (
              <button
                ref={scrub} type="button" role="spinbutton"
                className="ballot-power-scrub-trigger"
                disabled={!balance || !!balanceError}
                aria-label="Voting power percentage"
                aria-valuemin={1} aria-valuemax={100} aria-valuenow={numericShare}
                aria-valuetext={`${displayedShare} of your voting power`}
                aria-describedby={`${id}-hint`}
                title="Click to type · Drag left or right to adjust"
                onPointerDown={(event) => {
                  if (event.button !== 0 || !event.isPrimary) return;
                  suppressClick.current = false;
                  gesture.current = { x: event.clientX, start: numericShare, last: numericShare, mode, percentage, moved: false };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const current = gesture.current;
                  if (!current || (!current.moved && Math.abs(event.clientX - current.x) < 4)) return;
                  current.moved = true;
                  suppressClick.current = true;
                  setDragging(true);
                  const next = Math.max(1, Math.min(100, Math.round(current.start + (event.clientX - current.x) / 4)));
                  if (next !== current.last) { current.last = next; changePercentage(String(next)); }
                }}
                onPointerUp={(event) => {
                  gesture.current = undefined;
                  setDragging(false);
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                  if (gesture.current?.moved) restore(gesture.current);
                  gesture.current = undefined;
                  suppressClick.current = true;
                  setDragging(false);
                }}
                onLostPointerCapture={() => { gesture.current = undefined; setDragging(false); }}
                onClick={() => {
                  if (suppressClick.current) { suppressClick.current = false; return; }
                  beginEditing();
                }}
                onKeyDown={(event) => {
                  const deltas: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
                  const delta = deltas[event.key];
                  if (delta !== undefined || event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    const next = event.key === "Home" ? 1 : event.key === "End" ? 100 : ((delta ?? 0) > 0 ? Math.floor(numericShare) : Math.ceil(numericShare)) + (delta ?? 0) * (event.shiftKey ? 10 : 1);
                    changePercentage(String(Math.max(1, Math.min(100, next))));
                  }
                }}
              >
                <span className="ballot-power-share">{balance ? <AnimatedAmount value={String(numericShare)} plain direction={direction} /> : "…"}</span><span className="ballot-power-percent-unit" aria-hidden="true">%</span>
              </button>
            )}
          </span>
          <ActionButton
            type="button"
            size="small"
            className="ballot-power-randomize"
            aria-label="Randomize voting power"
            aria-describedby={`${id}-hint`}
            disabled={!balance || !!balanceError}
            onClick={randomize}
          >
            <Shuffle size={14} aria-hidden="true" />
            <span>Randomize</span>
          </ActionButton>
        </div>
        <span className="ballot-power-values" aria-label="Counted voting power">
          <strong aria-live="polite">
            {error ? "Unavailable" : amount ? <AnimatedAmount value={amount} plain direction={direction} /> : "Calculating…"}
          </strong>
          {amount && !error && <span className="ballot-power-unit">{PUB_TOKEN_SYMBOL}</span>}
        </span>
      </div>
      <span id={`${id}-hint`} className="sr-only">
        Click the percentage to type, or drag left or right. Use arrow keys to adjust; hold Shift for steps of ten.
        Randomize picks a new voting weight between 99% and 100%, where the round’s precision allows.
      </span>
      {custom && <p className="vp-foot-note">A custom percentage gives your vote a predictable weight.</p>}
      {error && (
        <p id={`${id}-error`} className="vp-submission-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Make the effective amount visible before opening privacy extras or the review. */
export function VotingPowerPreview({ balance, error, adjusted, mode, percentage, presentation = "original", snapshot, info, warning }: {
  presentation?: PowerPresentation; snapshot?: string; info?: ReactNode; warning?: ReactNode;
  balance?: BallotWeight; error?: string; adjusted: boolean; mode: "random" | "custom"; percentage: string;
}) {
  let weight = balance;
  let problem = error;
  if (balance && (!adjusted || mode === "custom")) {
    try {
      weight = draftBallotWeight(balance, false, adjusted ? Number(percentage) : undefined);
    } catch (reason) { problem = reason instanceof Error ? reason.message : "Choose a valid percentage."; }
  }
  const explanation = problem ?? (adjusted ? mode === "random"
    ? "Privacy adjustment is on: a random 99–100% of your power. Change it in Privacy extras."
    : "Your chosen percentage gives a predictable weight. Choose Randomize in Privacy extras for a random weight."
    : "Using your full available voting power at this round’s precision.");
  const share = weight && !problem ? ballotWeightPercentage(weight) : undefined;
  const amount = weight && !problem ? `${displayNumber(formatUnits(weight.counted * weight.unit, weight.decimals), 2)} ${PUB_TOKEN_SYMBOL}` : undefined;
  if (presentation === "single") {
    const compactAmount = weight && !problem
      ? `${compactNumber(formatUnits(weight.counted * weight.unit, weight.decimals)).replace(/\.00(?=[KMBT]?$)/, "")} ${PUB_TOKEN_SYMBOL}`
      : undefined;
    return <BallotPowerSummary amount={compactAmount} share={adjusted ? share?.replace(/\.00%$/, "%") : undefined} error={problem} warning={warning}>
      <dl className="power-info-values">
        <div><dt>Your voting power (at snapshot)</dt><dd>{weight ? `${displayNumber(formatUnits(weight.power, weight.decimals), 2)} ${PUB_TOKEN_SYMBOL}` : snapshot ?? "Calculating…"}</dd></div>
        {share && <div><dt>Share used</dt><dd>{share}</dd></div>}
        {amount && <div><dt>Counted in this vote</dt><dd>{amount}</dd></div>}
      </dl>
      <p>{explanation}</p>
    </BallotPowerSummary>;
  }
  if (presentation === "sentence") return <div className="ballot-power-sentence" aria-live="polite">
    <div className="ballot-power-statement"><span>This vote will use</span>{share && <AnimatedAmount plain={true} value={share} />}</div>
    <div className="ballot-power-source"><span>of your <strong>{snapshot}</strong> voting power</span>{info}</div>
    <div className="ballot-power-counted"><span>Counted in this vote</span><strong>{amount ? <AnimatedAmount plain={true} value={amount} /> : problem ? "Unavailable" : "Calculating…"}</strong>
      <PowerInfo label="About the voting power used" compact={true}><p>{explanation}</p></PowerInfo>
    </div>
    {problem && <p role="alert">{problem}</p>}
  </div>;
  return <div className="ballot-effective-power" data-grouped={presentation === "paired" || undefined} aria-live="polite">
    <div><span className="ui-label-with-info">This vote will use{presentation === "paired" &&
      <PowerInfo label="About the voting power used" compact={true}><p>{explanation}</p></PowerInfo>}
    </span>{share && amount ? <PowerShare share={share} counted={amount} randomized={adjusted} />
      : <span>{problem ? "Unavailable" : "Calculating…"}</span>}</div>
    {(presentation === "original" || problem) && <p>{explanation}</p>}
  </div>;
}
