import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { BallotPanel } from "@/components/proposalVoting/ballot";
import { AddressText } from "@/components/text/address";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { PowerWarning } from "@/plugins/velocker/components/powerWarning";
import { useWalletModal } from "@/hooks/useWalletModal";
import { PUB_CHAIN } from "@/constants";
import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { switchDemoAccount } from "@/dev/demoWalletSession";
import { preparedSenderError, type PreparedBallot } from "../../utils/preparedBallot";
import type { BallotSubmissionResult } from "../../utils/ballotSubmission";

export function PreparedVoteCard({
  ballot,
  busy,
  error,
  onSend,
  onDiscard,
}: {
  ballot: PreparedBallot;
  busy: boolean;
  error?: string;
  onSend: () => Promise<BallotSubmissionResult>;
  onDiscard: () => void;
}) {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { open } = useWalletModal();
  const [walletError, setWalletError] = useState("");
  const [switching, setSwitching] = useState(false);
  const blocked = preparedSenderError(ballot, address, chainId);
  const needsWalletSwitch =
    !ballot.transactionHash &&
    ballot.expiresAt > Date.now() &&
    chainId === ballot.chainId &&
    address?.toLowerCase() === ballot.voter.toLowerCase();
  const changeWallet = async () => {
    setWalletError("");
    setSwitching(true);
    try {
      if (address && chainId !== PUB_CHAIN.id) await switchChainAsync({ chainId: PUB_CHAIN.id });
      else if (DESIGN_PREVIEW && address) switchDemoAccount();
      else await open();
    } catch {
      setWalletError("Could not open your wallet. Open it directly and select the account you want to use.");
    } finally {
      setSwitching(false);
    }
  };
  return (
    <BallotPanel title={ballot.transactionHash ? "Vote sent · awaiting confirmation" : "Signed ballot ready"}>
      <div className="vp-body">
        <p className="vp-note">
          {ballot.transactionHash
            ? "Your transaction has been sent. Check its confirmation before taking another action."
            : "Switch accounts in your wallet, or connect a different wallet, then send this signed ballot. The sending wallet only pays gas."}
        </p>
        <div className="ballot-review-summary">
          <div className="ballot-review-row">
            <span>Vote counts for</span>
            <AddressText bold={false}>{ballot.voter}</AddressText>
          </div>
          <div className="ballot-review-row">
            <span>Sending wallet</span>
            {address ? <AddressText bold={false}>{address}</AddressText> : <span>Not connected</span>}
          </div>
        </div>
        <p className="ballot-mask-hint">
          The encrypted ballot is saved in this browser. Reloading or changing wallets will not erase it.
        </p>
        {needsWalletSwitch ? (
          <PowerWarning title="You haven’t switched wallets yet">
            You’re still connected to the wallet that signed this ballot. Switch to a different wallet before sending.
          </PowerWarning>
        ) : blocked ? (
          <p className="vp-note" role="status">
            {blocked}
          </p>
        ) : null}
        {(error || walletError) && (
          <p className="vp-submission-error" role="alert">
            {walletError || error} Your ballot has not been discarded.
          </p>
        )}
        {ballot.transactionHash && (
          <a
            className="ui-text-action"
            href={`${PUB_CHAIN.blockExplorers?.default?.url}/tx/${ballot.transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction ↗
          </a>
        )}
        <div className="vp-cta">
          {!ballot.transactionHash && (
            <PowerAction disabled={busy || switching} onClick={() => void changeWallet()}>
              {!address
                ? "Connect sending wallet"
                : chainId !== PUB_CHAIN.id
                  ? `Switch to ${PUB_CHAIN.name}`
                  : DESIGN_PREVIEW
                    ? "Switch demo wallet"
                    : "Open wallet"}
            </PowerAction>
          )}
          <PowerAction
            intent="vote"
            disabled={busy || switching || !!blocked}
            isLoading={busy}
            onClick={() => void onSend()}
          >
            {ballot.transactionHash ? "Check confirmation" : "Send signed ballot"}
          </PowerAction>
          <PowerAction disabled={busy || switching || !!ballot.transactionHash} onClick={onDiscard}>
            Discard signed ballot
          </PowerAction>
        </div>
      </div>
    </BallotPanel>
  );
}
