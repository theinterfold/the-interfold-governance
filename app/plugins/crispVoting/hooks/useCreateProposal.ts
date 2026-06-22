import { useRouter } from "next/router";
import { useState } from "react";
import type { ProposalMetadata, RawAction } from "@/utils/types";
import { useAlerts } from "@/context/Alerts";
import {
  PUB_APP_NAME,
  PUB_CHAIN,
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
  PUB_PROJECT_URL,
} from "@/constants";
import { uploadToPinata } from "@/utils/ipfs";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { maxUint256, encodeAbiParameters, parseAbiParameters, toHex } from "viem";
import { URL_PATTERN } from "@/utils/input-values";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { iVotesAbi } from "../artifacts/iVotes";
import { usePublicClient, useReadContract } from "wagmi";
import { CreditsMode } from "../utils/types";

const UrlRegex = new RegExp(URL_PATTERN);
const DEFAULT_DURATION_SECONDS = 60 * 60 * 24; // 1 day

export function useCreateProposal() {
  const { push } = useRouter();
  const { addAlert } = useAlerts();
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [actions, setActions] = useState<RawAction[]>([]);
  const [durationSeconds, setDurationSeconds] = useState<number>(DEFAULT_DURATION_SECONDS);
  const [resources, setResources] = useState<{ name: string; url: string }[]>([
    { name: PUB_APP_NAME, url: PUB_PROJECT_URL },
  ]);

  const client = usePublicClient();

  // Plugin-enforced minimum voting period (seconds).
  const { data: minDurationRaw } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
    abi: CrispVotingAbi,
    functionName: "minDuration",
  });
  const minDuration = minDurationRaw ? Number(minDurationRaw) : 0;

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

  const { writeContractAsync: approveTokens } = useTransactionManager({
    onSuccessMessage: "Tokens approved",
    onErrorMessage: "Could not approve tokens to the plugin contract",
    onError: () => setIsCreating(false),
  });

  const submitProposal = async () => {
    if (!title.trim()) {
      return addAlert("Invalid proposal details", { description: "Please enter a title", type: "error" });
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
    if (minDuration && durationSeconds < minDuration) {
      return addAlert("Voting period too short", {
        description: `The minimum voting period is ${Math.ceil(minDuration / 3600)} hour(s).`,
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

      // The plugin always uses a 3-option, CUSTOM (token-weighted) ballot regardless of `_data`;
      // these are encoded only to satisfy the (allowFailureMap, numOptions, creditMode, credits) layout.
      const allowFailureMap = 0n;
      const data = encodeAbiParameters(parseAbiParameters("uint256, uint256, uint256, uint256"), [
        allowFailureMap,
        3n,
        BigInt(CreditsMode.CUSTOM),
        0n,
      ]);

      // start = 0 => the contract uses `now` (so it can never be in the past); end = now + duration
      // (+60s buffer so the mining delay doesn't drop it below minDuration).
      const startDate = 0;
      const endDate = Math.floor(Date.now() / 1000) + durationSeconds + 60;

      const tx = await approveTokens({
        chainId: PUB_CHAIN.id,
        abi: iVotesAbi,
        address: PUB_INTERFOLD_FEE_TOKEN_ADDRESS,
        functionName: "approve",
        // for now we just max approve
        args: [PUB_CRISP_VOTING_PLUGIN_ADDRESS, maxUint256],
      });

      await client?.waitForTransactionReceipt({ hash: tx });

      await createProposalWrite({
        chainId: PUB_CHAIN.id,
        abi: CrispVotingAbi,
        address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
        functionName: "createProposal",
        args: [toHex(ipfsPin), actions, startDate, endDate, data],
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
    durationSeconds,
    setDurationSeconds,
    minDuration,
  };
}
