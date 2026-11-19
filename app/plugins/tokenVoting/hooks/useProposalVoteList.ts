import { useState, useEffect, useCallback, useRef } from "react";
import { getAbiItem } from "viem";
import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { PUB_DEPLOYMENT_BLOCK, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { fetchVotes } from "@/utils/crispIndexer";
import { publicClient } from "../utils/client";
import type { AbiEvent } from "viem";
import type { Proposal, VoteCastEvent } from "../utils/types";

const event = getAbiItem({ abi: TokenVotingAbi, name: "VoteCast" }) as AbiEvent;

export function useProposalVoteList(proposalId: bigint, proposal: Proposal | null, refreshKey?: string) {
  const [state, setState] = useState<{
    proposalId: bigint;
    votes?: VoteCastEvent[];
    loading: boolean;
    error: boolean;
  }>({ proposalId, loading: true, error: false });
  const request = useRef(0);
  const proposalReady = !!proposal;

  const getLogs = useCallback(async () => {
    if (!proposalReady || !publicClient) return;
    const currentRequest = ++request.current;
    setState((previous) => ({
      proposalId,
      votes: previous.proposalId === proposalId ? previous.votes : undefined,
      loading: true,
      error: false,
    }));

    try {
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
        if (request.current === currentRequest) setState({ proposalId, votes, loading: false, error: false });
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
      if (request.current === currentRequest) setState({ proposalId, votes: newLogs, loading: false, error: false });
    } catch {
      if (request.current === currentRequest) {
        setState((previous) => ({ ...previous, loading: false, error: true }));
      }
    }
  }, [proposalId, proposalReady]);

  useEffect(() => {
    void getLogs();
    return () => {
      request.current += 1;
    };
  }, [getLogs, refreshKey]);

  const current = state.proposalId === proposalId ? state : undefined;
  return {
    votes: current?.votes ?? [],
    isLoading: current?.loading ?? true,
    isError: current?.error ?? false,
    hasLoaded: current?.votes !== undefined,
    retry: getLogs,
  };
}
