import { useWalletModal } from "@/hooks/useWalletModal";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { DEMO_SENDING_WALLET, switchDemoAccount } from "@/dev/demoWalletSession";
import { useAccount } from "wagmi";
import Link from "next/link";

/** Shared empty state: an unavailable ballot should not look like a voting form. */
export function BallotEligibilityNotice({
  connected,
  canVote,
  votingPower,
  failed = false,
}: {
  connected: boolean;
  canVote?: boolean;
  votingPower?: bigint;
  failed?: boolean;
}) {
  const { address } = useAccount();
  const demoSendingWallet = DESIGN_PREVIEW && address?.toLowerCase() === DEMO_SENDING_WALLET.toLowerCase();
  if (!connected) {
    return (
      <div className="ballot-eligibility">
        <p>Check your voting power for this proposal.</p>
        <ConnectToVote />
      </div>
    );
  }
  if (canVote === true) return null;
  if (demoSendingWallet && canVote === false && votingPower === 0n && !failed) {
    return (
      <div className="ballot-eligibility" role="status">
        <strong>You’re using the sending wallet</strong>
        <p>
          This demo wallet can send signed ballots and masks, but has no voting power. Switch back to the voting wallet
          to prepare a new vote.
        </p>
        <PowerAction onClick={switchDemoAccount}>Use voting wallet</PowerAction>
      </div>
    );
  }
  const title = failed
    ? "Could not check voting eligibility"
    : canVote === undefined
      ? "Checking voting eligibility…"
      : votingPower === 0n
        ? "No voting power for this proposal"
        : "Voting unavailable for this wallet";
  const description = failed
    ? "Eligibility could not be loaded. Please try again shortly."
    : canVote === undefined
      ? undefined
      : votingPower === 0n
        ? "Your wallet had no voting power at this proposal’s snapshot. Changes to locks or delegation apply to future proposals."
        : "This wallet does not meet the requirements to submit a vote on this proposal.";

  return (
    <div className="ballot-eligibility" role="status">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {canVote === false && votingPower === 0n && <Link href="/plugins/lock/#/">View voting power →</Link>}
    </div>
  );
}

function ConnectToVote() {
  const { open } = useWalletModal();
  return <PowerAction onClick={() => void open()}>Connect wallet</PowerAction>;
}
