import { useEffect, useState } from "react";
import { BallotPanel } from "@/components/proposalVoting/ballot";
import { BallotSuccess, VoteChangeAction } from "@/components/proposalVoting/ballotSuccess";
import { BallotWalletSummary } from "@/components/proposalVoting/ballotWalletSummary";

import type { PreparedVoteReceipt } from "../../utils/ballotSubmission";
import { MaskSubmissionSummary } from "./voteConfirmation";

export function SubmittedVoteCard({
  receipt,
  walletAddress,
  canChangeVote,
  onChangeVote,
  onSwitchWallet,
  maskReceipts = [],
}: {
  receipt: PreparedVoteReceipt;
  walletAddress?: string;
  canChangeVote: boolean;
  onChangeVote: () => void;
  onSwitchWallet: () => void | Promise<unknown>;
  maskReceipts?: (string | null)[];
}) {
  const [changeRequested, setChangeRequested] = useState(false);
  const [walletError, setWalletError] = useState("");
  const signerConnected = walletAddress?.toLowerCase() === receipt.voter.toLowerCase();
  // Account changes alone never reopen the ballot. The voter must first choose Change vote.
  useEffect(() => {
    if (changeRequested && signerConnected && canChangeVote) onChangeVote();
  }, [changeRequested, signerConnected, canChangeVote, onChangeVote]);

  const changeVote = async () => {
    setChangeRequested(true);
    setWalletError("");
    if (signerConnected) return;
    try {
      await onSwitchWallet();
    } catch {
      setWalletError("Open your wallet and select the account that signed this vote.");
    }
  };

  return (
    <BallotPanel submitted>
      <div className="vp-body">
        <BallotSuccess
          txHash={receipt.txHash}
          action={
            canChangeVote ? (
              <VoteChangeAction disabled={false} votingClosed={false} onChange={() => void changeVote()} />
            ) : undefined
          }
        >
          Your vote counts for the wallet that signed it. The other wallet only sent the transaction and paid gas.
        </BallotSuccess>
        <MaskSubmissionSummary receipts={maskReceipts} />
        <BallotWalletSummary voter={receipt.voter} sender={receipt.sender} submitted />
        {canChangeVote && (
          <>
            <p className="vp-note">
              {changeRequested && !signerConnected
                ? "Switch to the wallet that signed this vote to choose a new option. Your submitted vote stays in place until you submit a new one."
                : "You can change your vote before voting closes. Your latest submitted vote replaces the previous one."}
            </p>
          </>
        )}
        {walletError && (
          <p className="vp-submission-error" role="alert">
            {walletError}
          </p>
        )}
      </div>
    </BallotPanel>
  );
}
