import { BallotActivity } from "@/components/proposalVoting/ballotActivity";
import { useQuery } from "@tanstack/react-query";
import { useCrispProgram } from "../hooks/useCrispProgram";
import { readAztecActivity } from "../utils/aztec/round";

/**
 * Encrypted ballot activity for a round cast on Aztec: every input the votes contract committed (`INPUT_COMMITTED`
 * logs). Votes, re-votes and masks are indistinguishable. An input counts once it is committed; the CRISP server
 * reads it from Aztec after the epoch holding it is proven, which is what the round's computation waits for.
 */
export function AztecActivityCard({ e3Id }: { e3Id: bigint }) {
  const program = useCrispProgram(e3Id);
  const {
    data: round,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["crisp-aztec-activity", program, e3Id.toString()],
    queryFn: () => readAztecActivity(program!, e3Id),
    enabled: program !== undefined,
    refetchInterval: (query) => (query.state.data?.closed ? false : 15_000),
  });
  const entries = round?.inputs;
  const committed = entries?.length ?? 0;

  return (
    <BallotActivity
      title={
        <>
          Encrypted ballot activity <span className="proposal-detail-count">{committed}</span>
        </>
      }
    >
      <div className="proposal-activity-body">
        <p className="text-xs text-neutral-500">
          Each entry is an encrypted input committed on Aztec for this round. Votes, overrides and masks are
          indistinguishable. A ballot counts as soon as it is committed.
        </p>

        {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
        {/* A failed read is not an empty round: "no inputs" here reads as "my vote was lost". */}
        {!isLoading && entries === undefined && isError && (
          <p className="text-sm text-critical-500">Could not load the ballot activity right now.</p>
        )}
        {!isLoading && entries !== undefined && committed === 0 && (
          <p className="text-sm text-neutral-500">No encrypted inputs posted yet.</p>
        )}

        <div className="flex max-h-64 flex-col gap-y-2 overflow-y-auto">
          {entries?.map((entry) => (
            <div key={entry.txHash} className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">#{entry.index}</span>
              <span className="font-mono text-neutral-800">
                {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-6)}
              </span>
              <span className="text-neutral-400">Aztec block {entry.blockNumber}</span>
            </div>
          ))}
        </div>
      </div>
    </BallotActivity>
  );
}
