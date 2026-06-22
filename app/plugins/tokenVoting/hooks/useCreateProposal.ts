import { useRouter } from "next/router";
import { useState } from "react";
import type { ProposalMetadata, RawAction } from "@/utils/types";
import { useAlerts } from "@/context/Alerts";
import { PUB_APP_NAME, PUB_CHAIN, PUB_TOKEN_VOTING_PLUGIN_ADDRESS, PUB_PROJECT_URL } from "@/constants";
import { uploadToPinata } from "@/utils/ipfs";
import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { URL_PATTERN } from "@/utils/input-values";
import { toHex } from "viem";
import { useReadContract } from "wagmi";
import { VoteOption } from "../utils/types";
import { useTransactionManager } from "@/hooks/useTransactionManager";

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

  // Plugin-enforced minimum voting period (seconds).
  const { data: minDurationRaw } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
    abi: TokenVotingAbi,
    functionName: "minDuration",
  });
  const minDuration = minDurationRaw ? Number(minDurationRaw) : 0;

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
        // TokenVoting ballots are fixed Yes / No / Abstain
        options: ["Yes", "No", "Abstain"],
      };

      const ipfsPin = await uploadToPinata(JSON.stringify(proposalMetadataJsonObject));

      // startDate 0 => the contract uses `now` (block.timestamp) as the start.
      // endDate is now + chosen duration; a small buffer absorbs the mining delay so the
      // effective period still clears minDuration.
      const allowFailureMap = BigInt(0);
      const startDate = BigInt(0);
      const endDate = BigInt(Math.floor(Date.now() / 1000) + durationSeconds + 60);
      const tryEarlyExecution = false;

      await createProposalWrite({
        chainId: PUB_CHAIN.id,
        abi: TokenVotingAbi,
        address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
        functionName: "createProposal",
        args: [toHex(ipfsPin), actions, allowFailureMap, startDate, endDate, VoteOption.None, tryEarlyExecution],
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
    durationSeconds,
    setDurationSeconds,
    minDuration,
  };
}
