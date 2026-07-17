import { useEffect, useState } from "react";
import { Button } from "@aragon/ods";
import { useAccount } from "wagmi";
import { If } from "@/components/if";
import { SppProposalState } from "../utils/types";
import { useSppAdvance } from "../hooks/useSppAdvance";
import { useSppVeto } from "../hooks/useSppVeto";

import type { SppKind, SppProposal, SppStage } from "../utils/types";

const VETO_STAGE_ID = 1;

interface VetoStageCardProps {
  kind: SppKind;
  proposalId: bigint;
  proposal: SppProposal | undefined;
  state: SppProposalState | undefined;
  vetoStage: SppStage | undefined;
  vetoTally: { approvals: bigint; vetoes: bigint } | undefined;
}

type VetoStatus = "pending" | "active" | "vetoed" | "executable" | "executed" | "expired" | "canceled";

/**
 * Stage-1 panel of an SPP proposal: the foundation veto window.
 * After the voting body approves, the proposal is held here for the veto
 * duration; if no veto lands, anyone can execute once the window lapses.
 */
export const VetoStageCard = ({ kind, proposalId, proposal, state, vetoStage, vetoTally }: VetoStageCardProps) => {
  const { address } = useAccount();
  const { vetoProposal, isConfirming: isVetoConfirming } = useSppVeto(kind, proposalId);
  const { advanceProposal, canAdvance, isConfirming: isAdvanceConfirming } = useSppAdvance(kind, proposalId, true);

  const inVetoStage = !!proposal && proposal.currentStage >= VETO_STAGE_ID;
  const vetoThreshold = vetoStage?.vetoThreshold ?? 1;
  const isVetoed = inVetoStage && (vetoTally?.vetoes ?? 0n) >= BigInt(vetoThreshold || 1);

  const vetoWindowEndsAt =
    inVetoStage && vetoStage ? Number(proposal.lastStageTransition + vetoStage.voteDuration) * 1000 : undefined;
  const countdown = useCountdown(vetoWindowEndsAt ?? 0);

  let status: VetoStatus;
  if (proposal?.executed) status = "executed";
  else if (proposal?.canceled) status = "canceled";
  else if (!inVetoStage) status = "pending";
  else if (isVetoed) status = "vetoed";
  else if (state === SppProposalState.Advanceable) status = "executable";
  else if (state === SppProposalState.Expired) status = "expired";
  else status = "active";

  const isVetoBody =
    !!address && !!vetoStage?.bodies?.[0]?.addr && address.toLowerCase() === vetoStage.bodies[0].addr.toLowerCase();
  const showVetoButton = status === "active" && isVetoBody;
  const showExecuteButton = status === "executable";

  const META_LABELS: Record<VetoStatus, string> = {
    pending: "Not started",
    active: "Veto window open",
    vetoed: "Vetoed",
    executable: "Executable",
    executed: "Executed",
    expired: "Expired",
    canceled: "Canceled",
  };

  const BADGE_CLASSES: Record<VetoStatus, string> = {
    pending: "pending",
    active: "active",
    vetoed: "failed",
    executable: "executable",
    executed: "executed",
    expired: "failed",
    canceled: "failed",
  };

  return (
    <div className="vote-panel">
      <div className="vp-head">
        <h3>Veto stage</h3>
        <span className="vp-meta">{META_LABELS[status]}</span>
      </div>
      <div className="vp-body">
        <div className="flex items-center gap-3">
          <span className={`badge ${BADGE_CLASSES[status]}`}>{META_LABELS[status]}</span>
          <If true={status === "active" && !!vetoWindowEndsAt}>
            <span className="text-sm text-neutral-500">Ends in {countdown}</span>
          </If>
        </div>

        <p className="vp-note">
          <If true={status === "pending"}>
            Once the voting stage passes, the proposal is held here for the foundation veto window before it can be
            executed.
          </If>
          <If true={status === "active"}>
            The foundation may veto this proposal until the window closes. If no veto lands, anyone can execute it
            afterwards.
          </If>
          <If true={status === "vetoed"}>The foundation vetoed this proposal. It can never be executed.</If>
          <If true={status === "executable"}>
            The veto window has lapsed with no veto — the proposal can now be executed by anyone.
          </If>
          <If true={status === "executed"}>The proposal passed the veto window and has been executed on the DAO.</If>
          <If true={status === "expired"}>The execution window has lapsed. The proposal can no longer be executed.</If>
          <If true={status === "canceled"}>The proposal has been canceled.</If>
        </p>

        <If true={showVetoButton}>
          <Button
            className="w-full"
            size="lg"
            variant="critical"
            isLoading={isVetoConfirming}
            onClick={() => vetoProposal()}
          >
            Veto proposal
          </Button>
        </If>
        <If true={showExecuteButton}>
          <Button
            className="w-full"
            size="lg"
            variant="primary"
            disabled={!canAdvance}
            isLoading={isAdvanceConfirming}
            onClick={() => advanceProposal()}
          >
            Execute proposal
          </Button>
        </If>
      </div>
    </div>
  );
};

function useCountdown(endTimestampMs: number): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!endTimestampMs || endTimestampMs - Date.now() <= 0) return;

    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [endTimestampMs]);

  const diff = endTimestampMs - now;
  if (diff <= 0) return "0 seconds";

  const seconds = Math.floor(diff / 1_000) % 60;
  const minutes = Math.floor(diff / 60_000) % 60;
  const hours = Math.floor(diff / 3_600_000) % 24;
  const days = Math.floor(diff / 86_400_000);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
