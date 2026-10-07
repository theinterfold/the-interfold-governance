import { BallotPanel } from "@/components/proposalVoting/ballot";
import { formatSettlementOpensAt } from "../utils/formatSettlementOpensAt";

/**
 * What happens between "voting closed" and a result.
 *
 * A CRISP round is not finished when voting ends. Each encrypted ballot must still be published
 * to Avail data availability and finalized on Ethereum by the VectorX bridge before the tally may
 * run — computing over unfinalized data would be unsound, so the server refuses to. Measured on a
 * real round, publication alone took 175 minutes.
 *
 * The tally is scheduled off the round's INPUT deadline, which is later than the voting deadline.
 * Without saying so, the page shows a closed vote with no result and no explanation for hours,
 * and the honest reading of that is "it broke".
 *
 * Shown only in the window where it answers a real question: voting is over, the round has not
 * failed, and no tally exists yet.
 */
export function SettlementProgressCard({
  votingClosed,
  isTallied,
  isDead,
  inputDeadline,
}: {
  votingClosed: boolean;
  isTallied: boolean;
  isDead: boolean;
  /** Unix seconds when the input window closes and the tally becomes due. */
  inputDeadline?: bigint;
}) {
  if (!votingClosed || isTallied || isDead) return null;

  const deadline = inputDeadline === undefined ? undefined : Number(inputDeadline);
  const now = Math.floor(Date.now() / 1000);
  const tallyDue = deadline !== undefined && now >= deadline;

  return (
    <BallotPanel title="Settling the round">
      <div className="vp-body">
        <p className="vp-note">
          Voting has closed. Before the result can be decrypted, every encrypted ballot is published to Avail data
          availability and finalized on Ethereum — the tally cannot run on data that is not yet final.
        </p>

        <ol className="vp-note flex flex-col gap-y-1">
          <li>1. Ballots published to data availability</li>
          <li>2. Publication finalized on Ethereum by the bridge</li>
          <li>3. Encrypted tally computed and the result published</li>
        </ol>

        {/* The deadline is a contract value, not an estimate. Counting takes a few hours after it, so
            the text must not promise the result at the deadline. */}
        {deadline !== undefined && (
          <p className="vp-note">
            {tallyDue
              ? "The settlement window has closed and the tally is due. The result should appear within a few hours."
              : `The tally is scheduled once the settlement window closes, ${formatSettlementOpensAt(deadline)}. It then takes a few hours.`}
          </p>
        )}

        <div className="ballot-eligibility" role="status">
          <strong>This wait is expected</strong>
          <p>
            Publication and finalization are not instant, and the delay is part of how the round stays verifiable. No
            action is needed from voters — ballots already cast are recorded on-chain.
          </p>
        </div>
      </div>
    </BallotPanel>
  );
}
