import { useState, useEffect } from "react";
import { getAbiItem } from "viem";
import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { PUB_DEPLOYMENT_BLOCK, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { publicClient } from "../utils/client";
import type { AbiEvent } from "viem";
import type { Proposal, VoteCastEvent } from "../utils/types";

const event = getAbiItem({ abi: TokenVotingAbi, name: "VoteCast" }) as AbiEvent;

export function useProposalVoteList(proposalId: bigint, proposal: Proposal | null) {
  const [proposalLogs, setLogs] = useState<VoteCastEvent[]>([]);

  async function getLogs() {
    if (!proposal || !publicClient) return;

    const logs = await publicClient.getLogs({
      address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
      event,
      args: { proposalId },
      fromBlock: BigInt(PUB_DEPLOYMENT_BLOCK),
      toBlock: "latest",
    });

    const newLogs = logs.flatMap((log) => (log as unknown as { args: VoteCastEvent }).args);
    if (newLogs.length > proposalLogs.length) setLogs(newLogs);
  }

  useEffect(() => {
    getLogs();
  }, [proposalId, !!proposal]);

  return proposalLogs;
}
