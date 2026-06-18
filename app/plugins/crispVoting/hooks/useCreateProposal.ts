import { useRouter } from "next/router";
import { useState } from "react";
import type { ProposalMetadata, RawAction } from "@/utils/types";
import { useAlerts } from "@/context/Alerts";
import {
  PUB_APP_NAME,
  PUB_CHAIN,
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_ENCLAVE_FEE_TOKEN_ADDRESS,
  PUB_PROJECT_URL,
} from "@/constants";
import { uploadToPinata } from "@/utils/ipfs";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { maxUint256 } from "viem";
import { URL_PATTERN } from "@/utils/input-values";
import { encodeAbiParameters, parseAbiParameters, toHex } from "viem";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { iVotesAbi } from "../artifacts/iVotes";
import { usePublicClient } from "wagmi";
import { CreditsMode } from "../utils/types";

const UrlRegex = new RegExp(URL_PATTERN);

export function useCreateProposal() {
  const { push } = useRouter();
  const { addAlert } = useAlerts();
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState<string>("A new proposal");
  const [summary, setSummary] = useState<string>("The summary");
  const [description, setDescription] = useState<string>("The description");
  const [actions, setActions] = useState<RawAction[]>([]);
  const [resources, setResources] = useState<{ name: string; url: string }[]>([
    { name: PUB_APP_NAME, url: PUB_PROJECT_URL },
  ]);
  const [startDate, setStartDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  const [numOptions, setNumOptions] = useState<number>(2);
  const [creditsMode, setCreditsMode] = useState<CreditsMode>(CreditsMode.CUSTOM);
  const [credits, setCredits] = useState<number>(0);
  const [optionLabels, setOptionLabels] = useState<string[]>(["Yes", "No"]);

  const client = usePublicClient();

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
        options: optionLabels,
      };

      const ipfsPin = await uploadToPinata(JSON.stringify(proposalMetadataJsonObject));

      const startDateTime = Math.floor(new Date(`${startDate}T${startTime ? startTime : "00:00:00"}`).getTime() / 1000);

      const endDateTime = Math.floor(new Date(`${endDate}T${endTime ? endTime : "00:00:00"}`).getTime() / 1000);

      const allowFailureMap = 0n;
      const data = encodeAbiParameters(parseAbiParameters("uint256, uint256, uint256, uint256"), [
        allowFailureMap,
        BigInt(numOptions),
        BigInt(creditsMode.toString()),
        BigInt(credits),
      ]);

      const tx = await approveTokens({
        chainId: PUB_CHAIN.id,
        abi: iVotesAbi,
        address: PUB_ENCLAVE_FEE_TOKEN_ADDRESS,
        functionName: "approve",
        // for now we just max approve
        args: [PUB_CRISP_VOTING_PLUGIN_ADDRESS, maxUint256],
      });

      await client?.waitForTransactionReceipt({ hash: tx });

      // create proposal once we have approved the contract to spend our tokens
      await createProposalWrite({
        chainId: PUB_CHAIN.id,
        abi: CrispVotingAbi,
        address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
        functionName: "createProposal",
        args: [toHex(ipfsPin), actions, startDateTime, endDateTime, data],
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
    startDate,
    startTime,
    endDate,
    endTime,
    setStartDate,
    setStartTime,
    setEndDate,
    setEndTime,
    credits,
    setCredits,
    creditsMode,
    setCreditsMode,
    numOptions,
    setNumOptions,
    optionLabels,
    setOptionLabels,
  };
}
