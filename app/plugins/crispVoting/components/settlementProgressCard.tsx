import { AlertCard } from "@aragon/ods";
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
    <div className="flex w-full flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-6 shadow-neutral-sm">
      <p className="text-base font-semibold text-neutral-800">Settling the round</p>

      <p className="text-sm text-neutral-500">
        Voting has closed. Before the result can be decrypted, every encrypted ballot is published to Avail data
        availability and finalized on Ethereum — the tally cannot run on data that is not yet final.
      </p>

      <ol className="flex flex-col gap-y-1 text-sm text-neutral-500">
        <li>1. Ballots published to data availability</li>
        <li>2. Publication finalized on Ethereum by the bridge</li>
        <li>3. Encrypted tally computed and the result published</li>
      </ol>

      {/* The deadline is the honest answer to "when will I see a result?", and it is a contract
          value rather than an estimate. */}
      {deadline !== undefined && (
        <p className="text-sm text-neutral-500">
          {tallyDue
            ? "The settlement window has closed and the tally is due — the result should appear shortly."
            : `The tally is scheduled once the settlement window closes, ${formatSettlementOpensAt(deadline)}.`}
        </p>
      )}

      <AlertCard
        variant="info"
        message="This wait is expected"
        description="Publication and finalization are not instant, and the delay is part of how the round stays verifiable. No action is needed from voters — ballots already cast are recorded on-chain."
      />
    </div>
  );
}
