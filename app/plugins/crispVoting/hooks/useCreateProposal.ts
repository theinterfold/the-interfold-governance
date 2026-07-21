import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { encodeAbiParameters, parseAbiParameters, toHex } from "viem";
import { useReadContract } from "wagmi";
import {
  PUB_APP_NAME,
  PUB_CHAIN,
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_PROJECT_URL,
  PUB_SPP_PRIVATE_ADDRESS,
} from "@/constants";
import { useAlerts } from "@/context/Alerts";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { StagedProposalProcessorAbi } from "@/plugins/spp/artifacts/StagedProposalProcessor";
import { useSppStages } from "@/plugins/spp/hooks/useSppStages";
import { URL_PATTERN } from "@/utils/input-values";
import { uploadToPinata } from "@/utils/ipfs";
import type { ProposalMetadata, RawAction } from "@/utils/types";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { applyFeeBuffer, useFeeCredits } from "./useFeeCredits";

const UrlRegex = new RegExp(URL_PATTERN);

/** Buffer left below the stage-0 maxAdvance so the tally can be published before the proposal expires. */
const MAX_ADVANCE_BUFFER_SECONDS = 3600;

/**
 * Explicit gas limit for SPP createProposal. The SPP wraps the body's sub-proposal creation in
 * try/catch, so eth_estimateGas converges on a limit where the CRISP sub-proposal (E3 request
 * included) runs out of gas, gets swallowed, and the outer tx still "succeeds". Over-provision
 * instead of trusting the estimate; unused gas is refunded.
 */
const CREATE_PROPOSAL_GAS_LIMIT = 5_000_000n;

export function useCreateProposal() {
  const { push } = useRouter();
  const { addAlert } = useAlerts();
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [actions, setActions] = useState<RawAction[]>([]);
  const [resources, setResources] = useState<{ name: string; url: string }[]>([
    { name: PUB_APP_NAME, url: PUB_PROJECT_URL },
  ]);

  // Voting-window bounds. The creator picks a per-proposal window; the plugin enforces a
  // minimum (minDuration) and the proposal expires past the stage-0 maxAdvance, so we cap
  // the window at maxAdvance minus a buffer that leaves room to publish the tally.
  const { votingStage } = useSppStages("private");
  const stageDurationSeconds = votingStage ? Number(votingStage.voteDuration) : undefined;

  const { data: minDurationData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "minDuration",
  });
  const minDurationSeconds = minDurationData !== undefined ? Number(minDurationData) : undefined;

  const maxDurationSeconds = votingStage
    ? Math.max(0, Number(votingStage.maxAdvance) - MAX_ADVANCE_BUFFER_SECONDS)
    : undefined;

  // Chosen voting window (seconds). Defaults to the larger of the stage window and the plugin
  // minimum once both are known.
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>(undefined);
  const [durationTouched, setDurationTouched] = useState(false);

  useEffect(() => {
    if (durationTouched || durationSeconds !== undefined) return;
    if (stageDurationSeconds === undefined && minDurationSeconds === undefined) return;
    setDurationSeconds(Math.max(stageDurationSeconds ?? 0, minDurationSeconds ?? 0));
  }, [durationTouched, durationSeconds, stageDurationSeconds, minDurationSeconds]);

  const setDuration = (seconds: number) => {
    setDurationTouched(true);
    setDurationSeconds(seconds);
  };

  const durationError = useMemo(() => {
    if (durationSeconds === undefined) return undefined;
    if (minDurationSeconds !== undefined && durationSeconds < minDurationSeconds) {
      return `The voting window must be at least ${minDurationSeconds} seconds.`;
    }
    if (maxDurationSeconds !== undefined && durationSeconds > maxDurationSeconds) {
      return `The voting window must be at most ${maxDurationSeconds} seconds so the tally can be published before the proposal expires.`;
    }
    return undefined;
  }, [durationSeconds, minDurationSeconds, maxDurationSeconds]);

  // Creator-pays E3 fee escrow on the CRISP plugin — quoted against the chosen window.
  const { quote, credit, deposit, refetchCredit } = useFeeCredits(durationSeconds);

  const { writeContractAsync: createProposalWrite } = useTransactionManager({
    onSuccessMessage: "Proposal created",
    onSuccess() {
      setTimeout(() => {
        push("#/");
        window.scroll(0, 0);
      }, 1000 * 2);
    },
    onErrorMessage: "Could not create the proposal",
    onError: () => setIsCreating(false),
  });

  const submitProposal = async () => {
    if (!title.trim()) {
      return addAlert("Invalid proposal details", {
        description: "Please enter a title",
        type: "error",
      });
    }
    if (!summary.trim()) {
      return addAlert("Invalid proposal details", {
        description: "Please enter a summary of what the proposal is about",
        type: "error",
      });
    }
    for (const item of resources) {
      if (!item.name.trim()) {
        return addAlert("Invalid resource name", {
          description: "Please enter a name for all the resources",
          type: "error",
        });
      } else if (!UrlRegex.test(item.url.trim())) {
        return addAlert("Invalid resource URL", {
          description: "Please enter valid URL for all the resources",
          type: "error",
        });
      }
    }
    if (durationSeconds === undefined) {
      return addAlert("Voting window unavailable", {
        description: "Could not determine the voting window bounds. Please try again.",
        type: "error",
      });
    }
    if (durationError) {
      return addAlert("Invalid voting window", {
        description: durationError,
        type: "error",
      });
    }
    if (quote === undefined || credit === undefined) {
      return addAlert("Fee quote unavailable", {
        description: "Could not read the proposal fee from the plugin. Please try again.",
        type: "error",
      });
    }

    try {
      setIsCreating(true);
      const proposalMetadataJsonObject: ProposalMetadata = {
        title,
        summary,
        description,
        resources,
        // Governance ballots are fixed Yes / No / Abstain.
        options: ["Yes", "No", "Abstain"],
      };

      const ipfsPin = await uploadToPinata(JSON.stringify(proposalMetadataJsonObject));

      // Top up the fee escrow if the current credit doesn't cover the quote.
      // Approves exactly the shortfall (+10% buffer) — no unlimited approvals.
      if (credit < quote) {
        const deposited = await deposit(applyFeeBuffer(quote - credit));
        if (!deposited) {
          setIsCreating(false);
          return;
        }
        refetchCredit();
      }

      // CRISP proposal `_data` is (allowFailureMap, votingDuration, credits). votingDuration is
      // the creator-chosen window in seconds (0 would fall back to the SPP stage window); credits
      // stays 0 for the default token-weighted ballot.
      const crispData = encodeAbiParameters(parseAbiParameters("uint256, uint256, uint256"), [
        0n,
        BigInt(durationSeconds),
        0n,
      ]);

      // Proposals are created on the SPP: it creates the stage-0 sub-proposal on the
      // CRISP body itself (endDate = start + stage voteDuration; no endDate param here).
      // _proposalParams is indexed [stageIdx][bodyIdx]; stage 1 (veto) is manual.
      const proposalParams: `0x${string}`[][] = [[crispData], []];

      await createProposalWrite({
        chainId: PUB_CHAIN.id,
        abi: StagedProposalProcessorAbi,
        address: PUB_SPP_PRIVATE_ADDRESS,
        functionName: "createProposal",
        args: [toHex(ipfsPin), actions, 0n, 0n, proposalParams],
        gas: CREATE_PROPOSAL_GAS_LIMIT,
      });
    } catch (err) {
      console.error("ERR", err);
      setIsCreating(false);
    }
  };

  return {
    isCreating,
    title,
    summary,
    description,
    actions,
    resources,
    setTitle,
    setSummary,
    setDescription,
    setActions,
    setResources,
    submitProposal,
    /** Creator-chosen voting window (seconds); undefined until the bounds load. */
    durationSeconds,
    setDuration,
    /** Minimum voting window enforced by the plugin (seconds). */
    minDurationSeconds,
    /** Maximum voting window (stage-0 maxAdvance minus the tally buffer, seconds). */
    maxDurationSeconds,
    /** Inline validation message when the chosen window is out of range. */
    durationError,
  };
}
