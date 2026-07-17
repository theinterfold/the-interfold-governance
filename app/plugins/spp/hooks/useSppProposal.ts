import { useEffect, useState } from "react";
import { useBlockNumber, useReadContract } from "wagmi";
import { fromHex, getAbiItem } from "viem";
import { PUB_CHAIN, PUB_DEPLOYMENT_BLOCK } from "@/constants";
import { publicClient } from "@/plugins/governance/utils/client";
import { StagedProposalProcessorAbi } from "../artifacts/StagedProposalProcessor";
import { SPP_PROPOSAL_WITHOUT_ID, SppProposalState, sppAddressFor } from "../utils/types";
import { useSppStages } from "./useSppStages";

import type { AbiEvent, Address, Hex } from "viem";
import type { SppKind, SppProposal } from "../utils/types";

export const SppProposalCreatedEvent = getAbiItem({
  abi: StagedProposalProcessorAbi,
  name: "ProposalCreated",
}) as AbiEvent;

/**
 * Reads a proposal from a Staged Proposal Processor instance:
 * the proposal struct, its state, the stage configuration it was created with,
 * the stage-0 body sub-proposal id, the stage-1 (veto) tally, and the metadata
 * URI + creator from the SPP's ProposalCreated event.
 */
export function useSppProposal(kind: SppKind, proposalId: bigint) {
  const address = sppAddressFor(kind);
  const [metadataUri, setMetadataUri] = useState<string>();
  const [creator, setCreator] = useState<string>();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const {
    data: proposalData,
    isLoading: proposalLoading,
    error: proposalError,
    refetch: refetchProposal,
  } = useReadContract({
    chainId: PUB_CHAIN.id,
    address,
    abi: StagedProposalProcessorAbi,
    functionName: "getProposal",
    args: [proposalId],
  });

  const proposal = proposalData as SppProposal | undefined;
  // lastStageTransition == 0 means the proposal does not exist.
  const exists = !!proposal && proposal.lastStageTransition !== 0n;

  const { data: stateData, refetch: refetchState } = useReadContract({
    chainId: PUB_CHAIN.id,
    address,
    abi: StagedProposalProcessorAbi,
    functionName: "state",
    args: [proposalId],
    query: { enabled: exists },
  });
  const state = stateData === undefined ? undefined : (Number(stateData) as SppProposalState);

  const { stages, votingStage, vetoStage } = useSppStages(kind, exists ? proposal.stageConfigIndex : undefined);

  // Stage-0 sub-proposal id on the voting body
  const stage0Body = votingStage?.bodies?.[0]?.addr as Address | undefined;
  const { data: bodyProposalIdData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address,
    abi: StagedProposalProcessorAbi,
    functionName: "getBodyProposalId",
    args: [proposalId, 0, stage0Body!],
    query: { enabled: exists && !!stage0Body },
  });
  const subProposalId = bodyProposalIdData as bigint | undefined;
  const subProposalFailed = subProposalId !== undefined && subProposalId === SPP_PROPOSAL_WITHOUT_ID;

  // Stage-1 (veto) tally
  const { data: vetoTallyData, refetch: refetchTally } = useReadContract({
    chainId: PUB_CHAIN.id,
    address,
    abi: StagedProposalProcessorAbi,
    functionName: "getProposalTally",
    args: [proposalId, 1],
    query: { enabled: exists && (proposal?.currentStage ?? 0) >= 1 },
  });
  const vetoTally = vetoTallyData
    ? {
        approvals: (vetoTallyData as readonly [bigint, bigint])[0],
        vetoes: (vetoTallyData as readonly [bigint, bigint])[1],
      }
    : undefined;

  // Keep the stage/state fresh (stage transitions and vetoes happen without user action)
  useEffect(() => {
    if (!exists) return;
    refetchProposal();
    refetchState();
    refetchTally();
  }, [blockNumber, exists]); // eslint-disable-line react-hooks/exhaustive-deps

  // Metadata URI + creator come from the SPP's ProposalCreated event
  useEffect(() => {
    if (!exists || !publicClient || metadataUri) return;

    publicClient
      .getLogs({
        address,
        event: SppProposalCreatedEvent,
        args: { proposalId },
        fromBlock: BigInt(PUB_DEPLOYMENT_BLOCK),
      })
      .then((logs) => {
        if (!logs?.length) return;

        const args = (logs[0] as unknown as { args: { metadata: Hex; creator: string } }).args;
        setMetadataUri(fromHex(args.metadata, "string"));
        setCreator(args.creator);
      })
      .catch((err) => {
        console.error("Could not fetch the SPP proposal creation event", err);
      });
  }, [proposalId, exists, metadataUri, address]);

  return {
    address,
    proposal: exists ? proposal : undefined,
    state,
    stages,
    votingStage,
    vetoStage,
    stage0Body,
    subProposalId: subProposalFailed ? undefined : subProposalId,
    subProposalFailed,
    vetoTally,
    metadataUri,
    creator,
    isLoading: proposalLoading,
    error: proposalError,
  };
}
