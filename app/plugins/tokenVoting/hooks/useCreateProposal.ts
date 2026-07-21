import { useRouter } from "next/router";
import { useState } from "react";
import type { ProposalMetadata, RawAction } from "@/utils/types";
import { useAlerts } from "@/context/Alerts";
import { PUB_APP_NAME, PUB_CHAIN, PUB_PROJECT_URL, PUB_SPP_PUBLIC_ADDRESS } from "@/constants";
import { uploadToPinata } from "@/utils/ipfs";
import { URL_PATTERN } from "@/utils/input-values";
import { encodeAbiParameters, parseAbiParameters, toHex } from "viem";
import { VoteOption } from "../utils/types";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { StagedProposalProcessorAbi } from "@/plugins/spp/artifacts/StagedProposalProcessor";
import { useSppStages } from "@/plugins/spp/hooks/useSppStages";

const UrlRegex = new RegExp(URL_PATTERN);

/**
 * Explicit gas limit for SPP createProposal. The SPP wraps the body's sub-proposal creation in
 * try/catch, so eth_estimateGas can converge on a limit where the TokenVoting sub-proposal runs
 * out of gas, gets swallowed, and the outer tx still "succeeds". Over-provision instead of
 * trusting the estimate; unused gas is refunded.
 */
const CREATE_PROPOSAL_GAS_LIMIT = 3_000_000n;

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

  // The voting window is governed by the SPP stage config, not the form.
  const { votingStage } = useSppStages("public");
  const stageDurationSeconds = votingStage ? Number(votingStage.voteDuration) : undefined;

  const { writeContractAsync: createProposalWrite, isConfirming } = useTransactionManager({
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
    // Check metadata
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

    try {
      setIsCreating(true);
      const proposalMetadataJsonObject: ProposalMetadata = {
        title,
        summary,
        description,
        resources,
        // TokenVoting ballots are fixed Yes / No / Abstain
        options: ["Yes", "No", "Abstain"],
      };

      const ipfsPin = await uploadToPinata(JSON.stringify(proposalMetadataJsonObject));

      // Custom params the SPP forwards to TokenVoting.createProposal, encoded per
      // its customProposalParamsABI(): (uint256 allowFailureMap, uint8 voteOption, bool tryEarlyExecution).
      const tokenVotingData = encodeAbiParameters(parseAbiParameters("uint256, uint8, bool"), [
        0n,
        VoteOption.None,
        false,
      ]);

      // Proposals are created on the SPP: it creates the stage-0 sub-proposal on the
      // TokenVoting body itself (endDate = start + stage voteDuration; no endDate param here).
      // _proposalParams is indexed [stageIdx][bodyIdx]; stage 1 (veto) is manual.
      const proposalParams: `0x${string}`[][] = [[tokenVotingData], []];

      await createProposalWrite({
        chainId: PUB_CHAIN.id,
        abi: StagedProposalProcessorAbi,
        address: PUB_SPP_PUBLIC_ADDRESS,
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
    isCreating: isCreating || isConfirming,
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
    /** Voting window, governed by the SPP stage config (display only). */
    stageDurationSeconds,
  };
}
