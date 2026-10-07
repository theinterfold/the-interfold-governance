import { useSyncExternalStore } from "react";
import { PUB_CHAIN, PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";
import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { demoPrivateVoteStatus, subscribeDemoData } from "@/dev/simulation";
import type { VoteStatus } from "@/components/proposalVoting/voteStatus";
import { voteEvidence } from "../utils/voteEvidence";

const subscribe = (listener: () => void) => {
  const unsubscribe = voteEvidence.subscribe(listener);
  const unsubscribeDemo = DESIGN_PREVIEW ? subscribeDemoData(listener) : undefined;
  return () => {
    unsubscribe();
    unsubscribeDemo?.();
  };
};
const serverStatus = (): VoteStatus => "loading";

export function usePrivateVoteStatus(roundId: bigint | undefined, voter: string | undefined): VoteStatus {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!voter) return "disconnected";
      if (roundId === undefined) return "loading";
      if (DESIGN_PREVIEW) return demoPrivateVoteStatus(roundId, voter);
      return (
        voteEvidence.get({ chainId: PUB_CHAIN.id, plugin: PUB_CRISP_VOTING_PLUGIN_ADDRESS, roundId, voter }) ??
        "unknown"
      );
    },
    serverStatus
  );
}
