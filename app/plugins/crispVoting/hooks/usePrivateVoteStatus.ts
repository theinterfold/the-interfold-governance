import { useSyncExternalStore } from "react";
import { PUB_CHAIN, PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";
import type { VoteStatus } from "@/components/proposalVoting/voteStatus";
import { voteEvidence } from "../utils/voteEvidence";

const serverStatus = (): VoteStatus => "loading";

export function usePrivateVoteStatus(roundId: bigint | undefined, voter: string | undefined): VoteStatus {
  return useSyncExternalStore(
    voteEvidence.subscribe,
    () => {
      if (!voter) return "disconnected";
      if (roundId === undefined) return "loading";
      return (
        voteEvidence.get({ chainId: PUB_CHAIN.id, plugin: PUB_CRISP_VOTING_PLUGIN_ADDRESS, roundId, voter }) ??
        "unknown"
      );
    },
    serverStatus
  );
}
