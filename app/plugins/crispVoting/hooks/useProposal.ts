import { useState, useEffect, useMemo, useRef } from "react";
import { useBlockNumber, useReadContract } from "wagmi";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { PUB_DEPLOYMENT_BLOCK } from "@/constants";
import { fetchProposals } from "@/utils/crispIndexer";
import { useMetadata } from "@/hooks/useMetadata";
import { getAbiItem, fromHex } from "viem";
import { publicClient } from "../utils/client";
import { useProposalBoundaryClock } from "@/plugins/governance/utils/useProposalBoundaryClock";

import type { RawAction, ProposalMetadata } from "@/utils/types";
import type { IRoundDetailsResponse, Proposal, Tally } from "../utils/types";
import type { AbiEvent, Hex } from "viem";
import { CreditsMode } from "../utils/types";
import { crispSdk } from "../utils/crispSdk";
import { E3Stage, useE3Status } from "./useE3Status";
import { e3Lifecycle, hasPublishedTally } from "../utils/e3Lifecycle";
import { usePrivatePair } from "./usePrivatePair";

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
  abi: CrispVotingAbi,
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

export function useProposal(proposalId: bigint, override?: ProposalSourceOverride) {
  const { body } = usePrivatePair();
  const [creationEvent, setCreationEvent] = useState<ProposalCreatedLogResponse["args"]>();
  const [metadataUri, setMetadataUri] = useState<string>();

  // On-chain proposal data
  const {
    data: proposalResult,
    error: proposalError,
    fetchStatus: proposalFetchStatus,
    refetch: refetchProposal,
  } = useReadContract({
    address: body,
    abi: CrispVotingAbi,
    functionName: "getProposal",
    args: [proposalId],
  });

  const [isTallied, setIsTallied] = useState(false);
  const [isCommitteeReady, setIsCommitteeReady] = useState(false);
  const [totalVotingPower, setTotalVotingPower] = useState<bigint | undefined>(undefined);

  // On-chain tally
  const { data: tallyResult, refetch: refetchTally } = useReadContract({
    address: body,
    abi: CrispVotingAbi,
    functionName: "getTally",
    args: [proposalId],
  });

  const proposalRaw = proposalResult as Proposal | undefined;

  const tally: Tally = useMemo(() => {
    if (!tallyResult) return [];
    const result = tallyResult as { counts?: bigint[] };
    return Array.isArray(result.counts) ? result.counts : [];
  }, [tallyResult]);

  // Interfold is the authority on whether a round failed, so ask it about anything not yet
  // tallied — not just rounds whose committee never formed. Gating on `!isCommitteeReady`
  // would leave every post-DKG failure (ComputeTimeout, ComputeProviderExpired,
  // ComputeProviderFailed, DecryptionTimeout, DecryptionInvalidShares, VerificationFailed)
  // on a proposal the UI still showed as healthy. A tallied round is terminal and cannot fail
  // afterwards, so that gate stays.
  const {
    stage: e3Stage,
    inputStartMs,
    inputEndMs,
    isDead: e3Failed,
    isFailurePending: e3FailurePending,
    failureReason: e3FailureReason,
  } = useE3Status(proposalRaw?.e3Id, !hasPublishedTally(tally, isTallied));

  const startMs = proposalRaw ? Number(proposalRaw.parameters.startDate) * 1000 : undefined;
  const endMs = proposalRaw ? Number(proposalRaw.parameters.endDate) * 1000 : undefined;
  const nowMs = useProposalBoundaryClock(startMs, endMs);
  const tallyMissing = tally.length === 0;

  // A tallied round or a dead round cannot change again, so it stops following the chain. A dead
  // round can be one the CRISP server never recorded, which answers 404 to every poll.
  const roundSettled = (isTallied && isCommitteeReady) || e3Failed;
  const { data: blockNumber } = useBlockNumber({ watch: proposalRaw?.e3Id !== undefined && !roundSettled });

  // The SDK can mark a round Finished before getTally becomes available. Refresh
  // the on-chain reads at the deadline and on subsequent blocks until it does.
  useEffect(() => {
    if (!proposalRaw || startMs === undefined || endMs === undefined) return;
    const inVotingWindow = nowMs >= startMs && nowMs < endMs;
    if ((inVotingWindow && !proposalRaw.executed) || (nowMs >= endMs && tallyMissing)) {
      void refetchProposal();
    }
    if (tallyMissing && (isTallied || nowMs >= endMs)) void refetchTally();
  }, [
    blockNumber,
    startMs,
    endMs,
    nowMs,
    proposalRaw?.executed,
    tallyMissing,
    isTallied,
    refetchProposal,
    refetchTally,
  ]);

  const eligibleVotersFetched = useRef(false);

  useEffect(() => {
    if (proposalRaw?.e3Id === undefined) return;
    if (roundSettled) return;

    const roundId = BigInt(proposalRaw.e3Id.toString());

    crispSdk
      .getRoundStateLite(roundId)
      .then(async (raw) => {
        const data = raw as unknown as IRoundDetailsResponse | null;
        setIsTallied(data?.status === "Finished");
        setIsCommitteeReady(
          data
            ? data.committee_public_key.length > 0 && (data.status === "Active" || data.status === "Finished")
            : false
        );

        if (data && data.credit_mode === CreditsMode.CONSTANT && data.credits && !eligibleVotersFetched.current) {
          eligibleVotersFetched.current = true;
          const voters = await crispSdk.getEligibleAddresses(roundId);
          setTotalVotingPower(BigInt(data.credits) * BigInt(voters.length));
        } else if (data && data.credit_mode !== CreditsMode.CONSTANT) {
          setTotalVotingPower(undefined);
        }
      })
      .catch(() => {});
  }, [proposalRaw?.e3Id, blockNumber, roundSettled]);

  // Fetch creation event (only once when proposal data is available)
  const snapshotBlock = proposalRaw?.parameters?.snapshotBlock;

  useEffect(() => {
    if (override?.metadataUri) return;
    if (!snapshotBlock || !publicClient || creationEvent) return;

    void (async () => {
      // One request to the server, which holds this plugin's log history, instead of a scan from
      // the deployment block on every proposal page.
      const match = (
        await fetchProposals({
          plugin: body,
          fromBlock: PUB_DEPLOYMENT_BLOCK,
          proposalId,
        })
      )?.[0];
      if (match) {
        setCreationEvent({
          proposalId,
          creator: match.creator,
          startDate: BigInt(match.start_date),
          endDate: BigInt(match.end_date),
          metadata: match.metadata,
        } as unknown as ProposalCreatedLogResponse["args"]);
        setMetadataUri(fromHex(match.metadata, "string"));
        return;
      }

      try {
        const logs = await publicClient.getLogs({
          address: body,
          event: ProposalCreatedEvent,
          args: { proposalId },
          // INV-19: `snapshotBlock` is in the token's ERC-6372 clock units — a TIMESTAMP for
          // FOLD (mode=timestamp) — so it must never be used as a block tag. Scan from the
          // plugin deployment block instead; no proposal can precede it.
          fromBlock: BigInt(PUB_DEPLOYMENT_BLOCK),
        });

        if (!logs?.length) return;

        const log = logs[0] as unknown as { args: ProposalCreatedLogResponse["args"] };
        setCreationEvent(log.args);
        setMetadataUri(fromHex(log.args.metadata as Hex, "string"));
      } catch (err) {
        console.error("Could not fetch proposal creation event", err);
      }
    })();
  }, [body, proposalId, snapshotBlock, creationEvent, override?.metadataUri]);

  // JSON metadata
  const {
    data: metadata,
    isLoading: metadataLoading,
    error: metadataError,
  } = useMetadata<ProposalMetadata>(override?.metadataUri ?? metadataUri);

  const proposal = useMemo(
    () =>
      arrangeProposalData(
        proposalRaw,
        creationEvent,
        metadata,
        tally,
        isTallied || e3Stage === E3Stage.Complete,
        override?.creator
      ),
    [proposalRaw, creationEvent, metadata, tally, isTallied, e3Stage, override?.creator]
  );

  const networkNowMs = useProposalBoundaryClock(inputStartMs, inputEndMs);
  const networkProgress = e3Lifecycle({
    stage: e3Stage,
    inputStartMs,
    inputEndMs,
    nowMs: networkNowMs,
    hasTally: proposal?.isTallied,
    failed: e3Failed,
  });

  return {
    proposal,
    networkProgress,
    isCommitteeReady,
    totalVotingPower,
    e3Failed,
    e3FailurePending,
    e3FailureReason,
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

function arrangeProposalData(
  proposalData?: Proposal,
  creationEvent?: ProposalCreatedLogResponse["args"],
  metadata?: ProposalMetadata,
  tally: Tally = [],
  isTallied = false,
  creatorOverride?: string
): Proposal | null {
  if (!proposalData) return null;

  return {
    actions: proposalData.actions,
    active: proposalData.parameters.endDate > BigInt(Math.floor(Date.now() / 1000)),
    executed: proposalData.executed,
    parameters: proposalData.parameters,
    tally,
    allowFailureMap: proposalData.allowFailureMap,
    creator: creatorOverride ?? creationEvent?.creator ?? "",
    title: metadata?.title ?? "",
    summary: metadata?.summary ?? "",
    description: metadata?.description ?? "",
    resources: metadata?.resources ?? [],
    e3Id: proposalData.e3Id,
    options: metadata?.options ?? ["Yes", "No"],
    numOptions: metadata?.options?.length ?? 2,
    isTallied: hasPublishedTally(tally, isTallied),
  };
}
