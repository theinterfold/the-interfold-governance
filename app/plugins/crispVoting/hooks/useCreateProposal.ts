import { useRouter } from "next/router";
import { useState } from "react";
import { encodeAbiParameters, encodeFunctionData, type Hex, parseAbi, parseAbiParameters, toHex } from "viem";
import { getCapabilities, sendCalls, waitForCallsStatus } from "viem/actions";
import { useConfig, useReadContract } from "wagmi";
import { getConnectorClient, readContract } from "wagmi/actions";
import { MINIMUM_START_DELAY_IN_SECONDS, PUB_CHAIN } from "@/constants";
import { useAlerts } from "@/context/Alerts";
import { useTransactionManager } from "@/hooks/useTransactionManager";
import { StagedProposalProcessorAbi } from "@/plugins/spp/artifacts/StagedProposalProcessor";
import { useSppStages } from "@/plugins/spp/hooks/useSppStages";
import { validateProposalDetails } from "@/plugins/governance/utils/proposalValidation";
import { useProposalDraft, type ProposalDraft } from "@/plugins/governance/hooks/useProposalDraft";
import { uploadToPinata } from "@/utils/ipfs";
import { decodeTxError } from "@/utils/tx-errors";
import type { ProposalMetadata } from "@/utils/types";
import { waitForWalletSync } from "@/utils/wallet-sync";
import { useFeeCredits } from "./useFeeCredits";
import { usePrivatePair } from "./usePrivatePair";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { scheduleVotingStart } from "../utils/votingSchedule";

/**
 * Explicit gas limit for SPP createProposal when the app sends it as a single transaction. The SPP
 * wraps the body's sub-proposal creation in try/catch, so eth_estimateGas converges on a limit where
 * the CRISP sub-proposal (E3 request included) runs out of gas, gets swallowed, and the outer tx
 * still "succeeds". Over-provision instead of trusting the estimate; unused gas is refunded. MetaMask
 * can replace this limit with that estimate, so the app sends an atomic batch instead when the
 * wallet supports one (see `createProposalAtomically`).
 *
 * On Sepolia, where EIP-8037 makes new storage slots much more expensive, the sub-proposal needs a
 * limit of at least 13.3M gas (12.7M used, 10M of it in the E3 request). The limit stays below
 * 2^24 (16,777,216) gas because EIP-7825 rejects a higher limit on chains without EIP-8037.
 */
const CREATE_PROPOSAL_GAS_LIMIT = 16_000_000n;

// `getE3` reverts with `E3DoesNotExist` for an id that no request has used. The batch reads no
// result from it, so the fragment declares no outputs.
const interfoldGuardAbi = parseAbi(["function nexte3Id() view returns (uint256)", "function getE3(uint256 e3Id) view"]);

export function useCreateProposal(draft?: ProposalDraft) {
  const { push } = useRouter();
  const config = useConfig();
  const pair = usePrivatePair();
  const { addAlert } = useAlerts();
  const [isCreating, setIsCreating] = useState(false);
  const localDraft = useProposalDraft();
  const {
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
  } = draft ?? localDraft;

  // The voting window is the stage-configured one (5 days on mainnet), never creator-chosen:
  // the SPP creates the sub-proposal with endDate = start + stage.voteDuration, and the
  // contract's `_data` carries only the allowFailureMap. Read the stage duration here purely
  // to quote the E3 fee against the real window.
  const { votingStage } = useSppStages("private");
  const durationSeconds = votingStage ? Number(votingStage.voteDuration) : undefined;
  const startBufferSeconds = Math.max(0, Math.floor(MINIMUM_START_DELAY_IN_SECONDS));

  const { data: earliestVotingStartData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: pair.body,
    abi: CrispVotingAbi,
    functionName: "earliestVotingStart",
  });

  const { data: availabilityWindowData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: pair.body,
    abi: CrispVotingAbi,
    functionName: "availabilityFinalizationWindow",
  });

  const votingStartsAt =
    earliestVotingStartData === undefined
      ? undefined
      : Number(scheduleVotingStart(earliestVotingStartData as bigint, startBufferSeconds));
  const availabilityWindowSeconds =
    availabilityWindowData === undefined ? undefined : Number(availabilityWindowData as bigint);

  // Creator-pays E3 fee escrow on the CRISP plugin — quoted against the stage window.
  const { quote, credit, depositNeeded, balanceShortfall, deposit, refetchCredit } = useFeeCredits(durationSeconds);

  const showProposalList = () =>
    setTimeout(() => {
      push("#/");
      window.scroll(0, 0);
    }, 1000 * 2);

  const { writeContractAsync: createProposalWrite } = useTransactionManager({
    onSuccessMessage: "Proposal created",
    onSuccess: showProposalList,
    onErrorMessage: "Could not create the proposal",
    onError: () => setIsCreating(false),
  });

  /**
   * Sends createProposal and `Interfold.getE3(nexte3Id)` as one atomic batch. Returns false, and
   * sends nothing, when the wallet cannot send an atomic batch.
   *
   * `getE3` reverts when the CRISP sub-proposal did not request its E3. A batch whose sub-proposal
   * runs out of gas therefore reverts and creates no proposal, and the wallet's gas estimate for the
   * batch covers the E3 request. The estimate for createProposal alone does not.
   */
  const createProposalAtomically = async (createProposalData: Hex): Promise<boolean> => {
    // A failed probe sends nothing here: the single-transaction path then reports the wallet error.
    const wallet = await getConnectorClient(config, { chainId: PUB_CHAIN.id }).catch(() => undefined);
    const capabilities = wallet && (await getCapabilities(wallet, { chainId: PUB_CHAIN.id }).catch(() => undefined));
    const atomic = capabilities?.atomic?.status;
    if (!wallet || (atomic !== "supported" && atomic !== "ready")) return false;

    try {
      const interfold = await readContract(config, {
        chainId: PUB_CHAIN.id,
        address: pair.body,
        abi: CrispVotingAbi,
        functionName: "interfold",
      });
      const nextE3Id = await readContract(config, {
        chainId: PUB_CHAIN.id,
        address: interfold,
        abi: interfoldGuardAbi,
        functionName: "nexte3Id",
      });
      await waitForWalletSync(config, PUB_CHAIN.id);
      const { id } = await sendCalls(wallet, {
        forceAtomic: true,
        calls: [
          { to: pair.spp, data: createProposalData },
          {
            to: interfold,
            data: encodeFunctionData({ abi: interfoldGuardAbi, functionName: "getE3", args: [nextE3Id] }),
          },
        ],
      });
      addAlert("Transaction submitted", { description: "Waiting for the transaction to be validated" });

      // `timeout: 0` waits for the final status with no time limit, as the single-transaction path does.
      const { status, receipts } = await waitForCallsStatus(wallet, { id, timeout: 0 });
      const txHash = receipts?.[0]?.transactionHash;
      if (status !== "success") {
        addAlert("Could not create the proposal", {
          type: "error",
          description: "The transaction failed and did not create a proposal. Please try again.",
          txHash,
        });
        setIsCreating(false);
        return true;
      }
      addAlert("Proposal created", {
        type: "success",
        description: "The transaction has been validated on the network",
        txHash,
      });
      showProposalList();
    } catch (err) {
      const friendly = decodeTxError(err, "Could not create the proposal");
      if (friendly.isUserRejection) {
        addAlert("The transaction signature was declined", { description: friendly.description, timeout: 4 * 1000 });
      } else {
        console.error("ERROR", err);
        addAlert(friendly.title, { type: "error", description: friendly.description });
      }
      setIsCreating(false);
    }
    return true;
  };

  const submitProposal = async () => {
    const [detailsError] = validateProposalDetails({ title, summary, resources });
    if (detailsError) {
      return addAlert("Check your proposal", {
        description: detailsError.message,
        type: "error",
      });
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
    // Refuse before pinning metadata or asking for an approval: the deposit's `transferFrom` would
    // revert inside the token, after the user had already paid gas for the approval.
    if (balanceShortfall) {
      return addAlert("Not enough funds for the proposal fee", {
        description: `${balanceShortfall} Top up your wallet, then submit again.`,
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
      if (depositNeeded > 0n) {
        const deposited = await deposit(depositNeeded);
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

      // Positional: (metadata, actions, allowFailureMap, startDate, proposalParams). Every action
      // must succeed, and 0 starts the stage now — CrispVoting lifts any start below
      // `earliestVotingStart()` up to it, so the voting window never depended on this argument.
      const createArgs = [toHex(ipfsPin), actions, 0n, 0n, proposalParams] as const;
      const createProposalData = encodeFunctionData({
        abi: StagedProposalProcessorAbi,
        functionName: "createProposal",
        args: createArgs,
      });
      if (await createProposalAtomically(createProposalData)) return;

      await createProposalWrite({
        chainId: PUB_CHAIN.id,
        abi: StagedProposalProcessorAbi,
        address: pair.spp,
        functionName: "createProposal",
        args: createArgs,
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
    votingStartsAt,
    availabilityWindowSeconds,
    /** Why the wallet cannot fund the fee deposit this proposal needs; undefined when it can. */
    feeBalanceShortfall: balanceShortfall,
  };
}
