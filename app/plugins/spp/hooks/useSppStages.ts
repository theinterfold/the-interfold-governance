import { useReadContract } from "wagmi";
import { PUB_CHAIN } from "@/constants";
import { StagedProposalProcessorAbi } from "../artifacts/StagedProposalProcessor";
import { sppAddressFor } from "../utils/types";

import type { SppKind, SppStage } from "../utils/types";

/**
 * Reads the SPP stage configuration.
 * When `configIndex` is omitted, the current configuration is used —
 * pass `proposal.stageConfigIndex` to read the config a proposal was created with.
 */
export function useSppStages(kind: SppKind, configIndex?: number) {
  const address = sppAddressFor(kind);

  const { data: currentConfigIndex } = useReadContract({
    chainId: PUB_CHAIN.id,
    address,
    abi: StagedProposalProcessorAbi,
    functionName: "getCurrentConfigIndex",
    query: { enabled: configIndex === undefined },
  });

  const effectiveIndex = configIndex ?? (currentConfigIndex !== undefined ? Number(currentConfigIndex) : undefined);

  const {
    data: stagesData,
    isLoading,
    error,
  } = useReadContract({
    chainId: PUB_CHAIN.id,
    address,
    abi: StagedProposalProcessorAbi,
    functionName: "getStages",
    args: [BigInt(effectiveIndex ?? 0)],
    query: { enabled: effectiveIndex !== undefined && effectiveIndex > 0 },
  });

  const stages = stagesData as readonly SppStage[] | undefined;

  return {
    stages,
    /** Stage 0 — the voting body stage (approval). */
    votingStage: stages?.[0],
    /** Stage 1 — the foundation veto stage. */
    vetoStage: stages?.[1],
    isLoading,
    error,
  };
}
