import { useState, useEffect } from "react";
import { useBlockNumber, useReadContract } from "wagmi";
import { fromHex, getAbiItem } from "viem";
import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { PUB_DEPLOYMENT_BLOCK, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { useMetadata } from "@/hooks/useMetadata";
import { publicClient } from "../utils/client";

import type { RawAction, ProposalMetadata } from "@/utils/types";
import type { Proposal, ProposalParameters, Tally } from "../utils/types";
import type { AbiEvent, Hex } from "viem";

type ProposalCreatedLogResponse = {
  args: {
    actions: RawAction[];
    allowFailureMap: bigint;
    creator: string;
    endDate: bigint;
    startDate: bigint;
    metadata: string;
    proposalId: bigint;
  };
};

export const ProposalCreatedEvent = getAbiItem({
  abi: TokenVotingAbi,
  name: "ProposalCreated",
}) as AbiEvent;

/**
 * When the proposal was created by an SPP, its metadata + creator live on the SPP's
 * ProposalCreated event (the body sub-proposal's metadata is an abi-encoded SPP
 * reference) — pass them via `override` to skip the body event lookup.
 */
export type ProposalSourceOverride = {
  metadataUri?: string;
  creator?: string;
};

export function useProposal(proposalId: bigint, autoRefresh = false, override?: ProposalSourceOverride) {
  const [creationEvent, setCreationEvent] = useState<ProposalCreatedLogResponse["args"]>();
  const [metadataUri, setMetadataUri] = useState<string>();
  const { data: blockNumber } = useBlockNumber({ watch: autoRefresh });

  // On-chain proposal data
  const {
    data: proposalResult,
    error: proposalError,
    fetchStatus: proposalFetchStatus,
    refetch: proposalRefetch,
  } = useReadContract({
    address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
    abi: TokenVotingAbi,
    functionName: "getProposal",
    args: [proposalId],
  });

  const proposalData = decodeProposalResultData(proposalResult as unknown as unknown[]);

  useEffect(() => {
    if (autoRefresh) proposalRefetch();
  }, [blockNumber, autoRefresh, proposalRefetch]);

  // Fetch the creation event once we have on-chain data (for creator + metadata uri)
  useEffect(() => {
    if (override?.metadataUri) return;
    if (!proposalData || !publicClient || creationEvent) return;

    publicClient
      .getLogs({
        address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
        event: ProposalCreatedEvent,
        args: { proposalId },
        fromBlock: BigInt(PUB_DEPLOYMENT_BLOCK),
      })
      .then((logs) => {
        if (!logs?.length) return;

        const log = logs[0] as unknown as ProposalCreatedLogResponse;
        setCreationEvent(log.args);
        setMetadataUri(fromHex(log.args.metadata as Hex, "string"));
      })
      .catch((err) => {
        console.error("Could not fetch the proposal creation event", err);
      });
  }, [proposalId, !!proposalData, creationEvent, override?.metadataUri]);

  // JSON metadata
  const {
    data: metadata,
    isLoading: metadataLoading,
    error: metadataError,
  } = useMetadata<ProposalMetadata>(override?.metadataUri ?? metadataUri);

  const proposal = arrangeProposalData(proposalData, creationEvent, metadata, override?.creator);

  return {
    proposal,
    status: {
      proposalReady: proposalFetchStatus === "idle",
      proposalLoading: proposalFetchStatus === "fetching",
      proposalError,
      metadataReady: !metadataError && !metadataLoading && !!metadata,
      metadataLoading,
      metadataError: metadataError !== undefined,
    },
  };
}

// Helpers

/** getProposal returns: open, executed, parameters, tally, actions, allowFailureMap, targetConfig */
function decodeProposalResultData(data?: unknown[]) {
  if (!data?.length || data.length < 6) return null;

  return {
    active: data[0] as boolean,
    executed: data[1] as boolean,
    parameters: data[2] as ProposalParameters,
    tally: data[3] as Tally,
    actions: data[4] as RawAction[],
    allowFailureMap: data[5] as bigint,
  };
}

function arrangeProposalData(
  proposalData?: ReturnType<typeof decodeProposalResultData>,
  creationEvent?: ProposalCreatedLogResponse["args"],
  metadata?: ProposalMetadata,
  creatorOverride?: string
): Proposal | null {
  if (!proposalData) return null;

  return {
    actions: proposalData.actions,
    active: proposalData.active,
    executed: proposalData.executed,
    parameters: proposalData.parameters,
    tally: proposalData.tally,
    allowFailureMap: proposalData.allowFailureMap,
    creator: creatorOverride ?? creationEvent?.creator ?? "",
    title: metadata?.title ?? "",
    summary: metadata?.summary ?? "",
    description: metadata?.description ?? "",
    resources: metadata?.resources ?? [],
  };
}
