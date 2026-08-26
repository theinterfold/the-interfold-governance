import { useState, useEffect } from "react";
import { getAbiItem } from "viem";
import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { PUB_DEPLOYMENT_BLOCK, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { fetchVotes } from "@/utils/crispIndexer";
import { publicClient } from "../utils/client";
import type { AbiEvent } from "viem";
import type { Proposal, VoteCastEvent } from "../utils/types";

const event = getAbiItem({ abi: TokenVotingAbi, name: "VoteCast" }) as AbiEvent;

export function useProposalVoteList(proposalId: bigint, proposal: Proposal | null) {
  const [proposalLogs, setLogs] = useState<VoteCastEvent[]>([]);

  async function getLogs() {
    if (!proposal || !publicClient) return;

    // The server filters by the event's indexed `proposalId`, so it returns one proposal's
    // ballots without this client walking the plugin's whole `VoteCast` history to find them.
    const fromServer = await fetchVotes({
      plugin: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
      proposalId,
      fromBlock: PUB_DEPLOYMENT_BLOCK,
    });
    if (fromServer) {
      const votes: VoteCastEvent[] = fromServer.map((vote) => ({
        voter: vote.voter,
        proposalId,
        voteOption: vote.vote_option,
        votingPower: BigInt(vote.voting_power),
      }));
      if (votes.length > proposalLogs.length) setLogs(votes);
      return;
    }

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
