import { useRouter } from "next/router";
import { useState } from "react";
import { encodeAbiParameters, parseAbiParameters, toHex } from "viem";
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
import { applyFeeBuffer, useFeeCredits } from "./useFeeCredits";

const UrlRegex = new RegExp(URL_PATTERN);

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

  // The voting window is the stage-configured one (5 days on mainnet), never creator-chosen:
  // the SPP creates the sub-proposal with endDate = start + stage.voteDuration, and the
  // contract's `_data` carries only the allowFailureMap. Read the stage duration here purely
  // to quote the E3 fee against the real window.
  const { votingStage } = useSppStages("private");
  const durationSeconds = votingStage ? Number(votingStage.voteDuration) : undefined;

  // Creator-pays E3 fee escrow on the CRISP plugin — quoted against the stage window.
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
        description: "Could not read the stage voting window. Please try again.",
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

      // CRISP proposal `_data` is (allowFailureMap) — nothing else. The voting window is the
      // stage-configured one and credits are always 0 (token-weighted), both fixed on-chain.
      const crispData = encodeAbiParameters(parseAbiParameters("uint256"), [0n]);

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
    /** The stage-configured voting window (seconds); undefined until the stage config loads. */
    durationSeconds,
  };
}
