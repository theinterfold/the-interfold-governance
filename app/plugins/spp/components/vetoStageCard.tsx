import { useEffect, useState } from "react";
import { Button } from "@aragon/ods";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { If } from "@/components/if";
import { PUB_CHAIN, PUB_DEPLOYMENT_BLOCK } from "@/constants";
import { publicClient } from "@/plugins/governance/utils/client";
import { SppProposalState, sppAddressFor } from "../utils/types";
import { useSppAdvance } from "../hooks/useSppAdvance";
import { useSppVeto } from "../hooks/useSppVeto";

import type { SppKind, SppProposal, SppStage } from "../utils/types";

const proposalExecutedEvent = parseAbiItem("event ProposalExecuted(uint256 indexed proposalId)");

/** Tx hash of the SPP's ProposalExecuted event for this proposal, once executed. */
function useExecutionTx(kind: SppKind, proposalId: bigint, executed: boolean) {
  const { data } = useQuery<string | null>({
    queryKey: ["spp-execution-tx", kind, proposalId.toString()],
    queryFn: async () => {
      const logs = await publicClient.getLogs({
        address: sppAddressFor(kind),
        event: proposalExecutedEvent,
        args: { proposalId },
        fromBlock: BigInt(PUB_DEPLOYMENT_BLOCK),
        toBlock: "latest",
      });
      return logs[0]?.transactionHash ?? null;
    },
    enabled: executed,
    staleTime: Infinity,
  });
  return data ?? null;
}

const VETO_STAGE_ID = 1;

interface VetoStageCardProps {
  kind: SppKind;
  proposalId: bigint;
  proposal: SppProposal | undefined;
  state: SppProposalState | undefined;
  vetoStage: SppStage | undefined;
  vetoTally: { approvals: bigint; vetoes: bigint } | undefined;
  /** The stage-0 vote failed definitively — the veto stage will never start. */
  stage0Failed?: boolean;
}

type VetoStatus = "pending" | "notNeeded" | "active" | "vetoed" | "executable" | "executed" | "expired" | "canceled";

/**
 * Stage-1 panel of an SPP proposal: the foundation veto window.
 * After the voting body approves, the proposal is held here for the veto
 * duration; if no veto lands, anyone can execute once the window lapses.
 */
export const VetoStageCard = ({
  kind,
  proposalId,
  proposal,
  state,
  vetoStage,
  vetoTally,
  stage0Failed,
}: VetoStageCardProps) => {
  const { address } = useAccount();
  const { vetoProposal, approveProposal, isConfirming: isVetoConfirming } = useSppVeto(kind, proposalId);
  const { advanceProposal, canAdvance, isConfirming: isAdvanceConfirming } = useSppAdvance(kind, proposalId, true);
  const executionTx = useExecutionTx(kind, proposalId, !!proposal?.executed);

  // Stage-1 mode, read from the on-chain stage config: approval (opt-in — the foundation must
  // explicitly approve; silence = expiry) vs veto (opt-out — silence = consent).
  const approvalMode = (vetoStage?.vetoThreshold ?? 1) === 0;

  const inVetoStage = !!proposal && proposal.currentStage >= VETO_STAGE_ID;
  const vetoThreshold = vetoStage?.vetoThreshold ?? 1;
  const isVetoed = !approvalMode && inVetoStage && (vetoTally?.vetoes ?? 0n) >= BigInt(vetoThreshold || 1);
  const isApproved =
    approvalMode && inVetoStage && (vetoTally?.approvals ?? 0n) >= BigInt(vetoStage?.approvalThreshold ?? 1);

  // Deadline shown while active: veto mode holds for voteDuration; approval mode has until
  // maxAdvance for the approval (and execution) to land before the proposal expires.
  const vetoWindowEndsAt =
    inVetoStage && vetoStage
      ? Number(proposal.lastStageTransition + (approvalMode ? vetoStage.maxAdvance : vetoStage.voteDuration)) * 1000
      : undefined;
  const countdown = useCountdown(vetoWindowEndsAt ?? 0);

  let status: VetoStatus;
  if (proposal?.executed) status = "executed";
  else if (proposal?.canceled) status = "canceled";
  else if (!inVetoStage && stage0Failed) status = "notNeeded";
  else if (!inVetoStage) status = "pending";
  else if (isVetoed) status = "vetoed";
  else if (state === SppProposalState.Advanceable) status = "executable";
  else if (state === SppProposalState.Expired) status = "expired";
  else status = "active";

  const isVetoBody =
    !!address && !!vetoStage?.bodies?.[0]?.addr && address.toLowerCase() === vetoStage.bodies[0].addr.toLowerCase();
  const showVetoButton = status === "active" && isVetoBody && !approvalMode;
  const showApproveButton = status === "active" && isVetoBody && approvalMode && !isApproved;
  const showExecuteButton = status === "executable";

  const META_LABELS: Record<VetoStatus, string> = {
    pending: "Not started",
    notNeeded: "Not needed",
    active: approvalMode ? "Awaiting approval" : "Veto window open",
    vetoed: "Vetoed",
    executable: "Executable",
    executed: "Executed",
    expired: approvalMode && !isApproved ? "Expired — not approved" : "Expired",
    canceled: "Canceled",
  };

  const BADGE_CLASSES: Record<VetoStatus, string> = {
    pending: "pending",
    notNeeded: "pending",
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
        <h3>{approvalMode ? "Approval stage" : "Veto stage"}</h3>
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
            {approvalMode
              ? "Once the voting stage passes, the proposal is held here until the foundation approves it."
              : "Once the voting stage passes, the proposal is held here for the foundation veto window before it can be executed."}
          </If>
          <If true={status === "notNeeded"}>
            The proposal did not pass the voting stage, so this stage will not take place.
          </If>
          <If true={status === "active"}>
            {approvalMode
              ? "The proposal needs an explicit foundation approval before it can be executed. Without one, it expires when the window closes."
              : "The foundation may veto this proposal until the window closes. If no veto lands, anyone can execute it afterwards."}
          </If>
          <If true={status === "vetoed"}>The foundation vetoed this proposal. It can never be executed.</If>
          <If true={status === "executable"}>
            {approvalMode
              ? "The foundation approved the proposal — it can now be executed by anyone."
              : "The veto window has lapsed with no veto — the proposal can now be executed by anyone."}
          </If>
          <If true={status === "executed"}>
            The proposal passed the veto window and has been executed on the DAO.
            {executionTx && PUB_CHAIN.blockExplorers?.default?.url && (
              <>
                {" "}
                <a
                  href={`${PUB_CHAIN.blockExplorers.default.url}/tx/${executionTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-400 hover:underline"
                >
                  View execution transaction ↗
                </a>
              </>
            )}
          </If>
          <If true={status === "expired"}>
            {approvalMode && !isApproved
              ? "The foundation did not approve the proposal in time. It can no longer be executed."
              : "The execution window has lapsed. The proposal can no longer be executed."}
          </If>
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
        <If true={showApproveButton}>
          <Button
            className="w-full"
            size="lg"
            variant="primary"
            isLoading={isVetoConfirming}
            onClick={() => approveProposal()}
          >
            Approve proposal
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
