import { VOTING_POWER_URL } from "@/constants";
import { WalletConnectionPrompt } from "@/components/walletConnectionPrompt";
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
  if (!connected) {
    return <WalletConnectionPrompt />;
  }
  if (canVote === true) return null;
  const title = failed
    ? "Could not check voting eligibility"
    : canVote === undefined
      ? "Checking voting eligibility…"
      : votingPower === 0n
        ? "No voting power for this proposal"
        : "Voting unavailable for this wallet";
  const description = failed
    ? "Please try again shortly."
    : canVote === undefined
      ? undefined
      : votingPower === 0n
        ? "Your wallet had no voting power at this proposal’s snapshot. Changes to locks or delegation apply to future proposals."
        : "This wallet does not meet the requirements to submit a vote on this proposal.";

  return (
    <div className="ballot-eligibility" role="status">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {canVote === false && votingPower === 0n && <Link href={VOTING_POWER_URL}>View voting power →</Link>}
    </div>
  );
}
