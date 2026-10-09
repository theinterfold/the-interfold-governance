import { useSyncExternalStore } from "react";
import { PUB_CHAIN } from "@/constants";
import { usePrivatePair } from "./usePrivatePair";
import type { VoteStatus } from "@/components/proposalVoting/voteStatus";
import { voteEvidence } from "../utils/voteEvidence";

const serverStatus = (): VoteStatus => "loading";

export function usePrivateVoteStatus(roundId: bigint | undefined, voter: string | undefined): VoteStatus {
  const { body } = usePrivatePair();
  return useSyncExternalStore(
    voteEvidence.subscribe,
    () => {
      if (!voter) return "disconnected";
      if (roundId === undefined) return "loading";
      return voteEvidence.get({ chainId: PUB_CHAIN.id, plugin: body, roundId, voter }) ?? "unknown";
    },
    serverStatus
  );
}
