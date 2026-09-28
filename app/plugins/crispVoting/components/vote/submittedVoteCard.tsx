import { useEffect, useState } from "react";
import { BallotPanel } from "@/components/proposalVoting/ballot";
import { BallotSuccess } from "@/components/proposalVoting/ballotSuccess";
import { AddressText } from "@/components/text/address";
import { PowerAction } from "@/plugins/velocker/components/powerAction";

import type { PreparedVoteReceipt } from "../../utils/ballotSubmission";

export function SubmittedVoteCard({
  receipt,
  walletAddress,
  canChangeVote,
  onChangeVote,
  onSwitchWallet,
}: {
  receipt: PreparedVoteReceipt;
  walletAddress?: string;
  canChangeVote: boolean;
  onChangeVote: () => void;
  onSwitchWallet: () => Promise<unknown>;
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
    <BallotPanel title="Voting" submitted>
      <div className="vp-body">
        <BallotSuccess txHash={receipt.txHash}>
          Your vote counts for the wallet that signed it. The other wallet only sent the transaction and paid gas.
        </BallotSuccess>
        <div className="ballot-review-summary">
          <div className="ballot-review-row">
            <span>Signed by</span>
            <AddressText bold={false}>{receipt.voter}</AddressText>
          </div>
          {receipt.sender && (
            <div className="ballot-review-row">
              <span>Sent by</span>
              <AddressText bold={false}>{receipt.sender}</AddressText>
            </div>
          )}
        </div>
        {canChangeVote && (
          <>
            <p className="vp-note">
              {changeRequested && !signerConnected
                ? "Switch to the wallet that signed this vote to choose a new option. Your submitted vote stays in place until you submit a new one."
                : "You can change your vote before voting closes. Your latest submitted vote replaces the previous one."}
            </p>
            <PowerAction affordance="undo" onClick={() => void changeVote()}>
              Change vote
            </PowerAction>
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
