import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { BallotPanel } from "@/components/proposalVoting/ballot";
import { BallotWalletSummary } from "@/components/proposalVoting/ballotWalletSummary";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { PowerWarning } from "@/plugins/velocker/components/powerWarning";
import { useWalletModal } from "@/hooks/useWalletModal";
import { PUB_CHAIN } from "@/constants";
import { unixTimestampToDate } from "../../utils/formatProposalDate";
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
  const needsWalletAction =
    !ballot.transactionHash &&
    ballot.expiresAt > Date.now() &&
    (!address || chainId !== ballot.chainId || needsWalletSwitch);
  const changeWallet = async () => {
    setWalletError("");
    setSwitching(true);
    try {
      if (address && chainId !== PUB_CHAIN.id) await switchChainAsync({ chainId: PUB_CHAIN.id });
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
            : needsWalletAction
              ? "Switch accounts in your wallet, or connect a different wallet, then send this signed ballot. The sending wallet only pays gas."
              : "This vote counts for the wallet that signed it. The sending wallet only pays gas."}
        </p>
        <BallotWalletSummary voter={ballot.voter} sender={address} />
        <p className="ballot-mask-hint">
          The encrypted ballot is saved in this browser. Reloading or changing wallets will not erase it.
          {!ballot.transactionHash && ` It can be sent until ${unixTimestampToDate(Math.floor(ballot.expiresAt / 1000))}.`}
        </p>
        {needsWalletSwitch ? (
          <PowerWarning
            title="You haven’t switched wallets yet"
            action={
              <PowerAction
                size="compact"
                affordance="wallet"
                disabled={busy || switching}
                onClick={() => void changeWallet()}
              >
                Change sending wallet
              </PowerAction>
            }
          >
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
          <PowerAction
            intent="vote"
            disabled={busy || switching || !!blocked}
            isLoading={busy}
            onClick={() => void onSend()}
          >
            {ballot.transactionHash ? "Check confirmation" : "Send signed ballot"}
          </PowerAction>
          {needsWalletAction && !needsWalletSwitch && (
            <PowerAction disabled={busy || switching} onClick={() => void changeWallet()}>
              {!address
                ? "Connect sending wallet"
                : chainId !== PUB_CHAIN.id
                  ? `Switch to ${PUB_CHAIN.name}`
                  : "Change sending wallet"}
            </PowerAction>
          )}
          <PowerAction
            intent="destructive"
            affordance="discard"
            disabled={busy || switching || !!ballot.transactionHash}
            onClick={onDiscard}
          >
            Discard signed ballot
          </PowerAction>
        </div>
      </div>
    </BallotPanel>
  );
}
