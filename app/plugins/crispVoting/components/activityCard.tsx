import { BallotActivity } from "@/components/proposalVoting/ballotActivity";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAbiItem, type Address } from "viem";
import { PUB_CHAIN, PUB_DEPLOYMENT_BLOCK } from "@/constants";
import { usePrivatePair } from "../hooks/usePrivatePair";
import { fetchRoundInputs } from "@/utils/crispIndexer";
import { publicClient } from "../utils/client";
import { crispSdk } from "../utils/crispSdk";
import { CrispVotingAbi } from "../artifacts/CrispVoting";

import { interfoldViewsAbi } from "../artifacts/interfoldViews";

/**
 * A ballot reaches the chain in TWO steps, and the gap between them is hours, not seconds.
 *
 *   InputCommitted — the ballot was accepted and its proof verified on-chain. Immediate.
 *   InputPublished — its ciphertext was published to Avail data availability. Measured at ~175
 *                    minutes after the commit on a real round; it is bounded by
 *                    `availabilityFinalizationWindow`, not by anything the voter does.
 *
 * Showing only the published half meant a voter who had just cast a ballot saw "No encrypted
 * inputs posted yet" for hours — the one message guaranteed to read as "my vote was lost".
 *
 * Both signatures below were taken from the deployed CRISPProgram ABI and checked against the
 * topics observed on-chain (`0xc2fc6cca…` / `0xbeebd5a7…`). The previous declaration here was
 * `InputPublished(uint256,bytes,uint256)`, which hashes to `0xa8b9f2de…` and therefore matched
 * NOTHING: the on-chain fallback silently returned an empty list on every round.
 */
const inputCommittedEvent = parseAbiItem(
  "event InputCommitted(uint256 indexed e3Id, bytes32 indexed inputId, address indexed slotAddress, bytes32 encryptedVoteCommitment, bytes32 encryptedVoteHash, uint40 parentIndexPlusOne, uint40 index)"
);

const inputPublishedEvent = parseAbiItem(
  "event InputPublished(uint256 indexed e3Id, address indexed slotAddress, bytes32 encryptedVoteCommitment, bytes32 encryptedVoteHash, uint32 availabilityBlock, uint128 availabilityLeafIndex, uint256 index, uint40 parentIndexPlusOne)"
);

interface ActivityEntry {
  txHash: `0x${string}`;
  index: bigint;
  blockNumber: bigint;
  /** True once the ciphertext has been published to Avail and the publication is on-chain. */
  published: boolean;
}

/** What the activity scan reads from the round. Interfold fixes all of it when the round is requested. */
type RoundScope = { program: Address; inputStart: bigint; inputEnd: bigint };

const roundScopeKey = (e3Id: bigint) => ["crisp-activity-scope", e3Id.toString()] as const;

async function readRoundScope(body: Address, e3Id: bigint): Promise<RoundScope> {
  const interfold = (await publicClient.readContract({
    address: body,
    abi: CrispVotingAbi,
    functionName: "interfold",
  })) as Address;

  const e3 = await publicClient.readContract({
    address: interfold,
    abi: interfoldViewsAbi,
    functionName: "getE3",
    args: [e3Id],
  });

  return { program: e3.e3Program, inputStart: e3.inputWindow[0], inputEnd: e3.inputWindow[1] };
}

/**
 * Encrypted ballot activity for a CRISP round: every encrypted input recorded on-chain for this
 * e3Id, with its data-availability state. Inputs are indistinguishable (vote, override or mask) —
 * this only shows that activity is happening. The program address is resolved on-chain per round:
 * CrispVoting.interfold() -> getE3(e3Id).e3Program.
 */
export function ActivityCard({ e3Id }: { e3Id: bigint }) {
  const queryClient = useQueryClient();
  const { body } = usePrivatePair();
  const {
    data: entries,
    isLoading,
    isError,
  } = useQuery<ActivityEntry[]>({
    queryKey: ["crisp-activity", e3Id.toString()],
    queryFn: async () => {
      // Read once and kept, so a refresh reads only the two logs below.
      const { program, inputStart } = await queryClient.fetchQuery({
        queryKey: roundScopeKey(e3Id),
        queryFn: () => readRoundScope(body, e3Id),
        staleTime: Infinity,
      });

      // A ballot cannot be committed before the round's input window opens, so scan from there
      // rather than from the plugin's deployment, ~280k blocks earlier on mainnet. When the CRISP
      // server's log index is cold, `/chain/rpc` rescans the requested range upstream, and the wide
      // scan outlasted the client's 10 s timeout on every retry: minutes of "Loading…" ending in
      // "No encrypted inputs" for a round that had them. `getBlockAtTimestamp` resolves the block
      // at or BEFORE the timestamp, so nothing inside the window is skipped. The server charges the
      // search as 32 reads against the caller's rate limit, so the answer is kept. A failed search
      // is not kept, and the next refresh tries it again.
      const fromBlock = await queryClient
        .fetchQuery({
          queryKey: ["crisp-block-at-timestamp", inputStart.toString()],
          queryFn: () => crispSdk.getBlockAtTimestamp(inputStart).then((r) => BigInt(r.blockNumber)),
          staleTime: Infinity,
        })
        .catch(() => BigInt(PUB_DEPLOYMENT_BLOCK));

      // Committed is the source of truth for "a ballot exists". Read it from the chain rather
      // than the server: `/rounds/inputs` reports PUBLISHED inputs only, so it answers `[]` for a
      // round whose ballots are still awaiting data availability.
      const [committedLogs, publishedLogs] = await Promise.all([
        publicClient.getLogs({
          address: program,
          event: inputCommittedEvent,
          args: { e3Id },
          fromBlock,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: program,
          event: inputPublishedEvent,
          args: { e3Id },
          fromBlock,
          toBlock: "latest",
        }),
      ]);

      // Match publications to commitments by the ciphertext hash, which both events carry. The
      // `index` fields are assigned independently by each path and do not correspond.
      const publishedHashes = new Set(
        publishedLogs.map((log) => (log.args.encryptedVoteHash ?? "").toString().toLowerCase())
      );

      // The server is consulted only for what the logs cannot answer — an older program whose
      // events omit the hash — and even then it is a superset check, never the count itself. A
      // round whose publications all matched does not wait on a second scan.
      const allMatched = committedLogs.every((log) =>
        publishedHashes.has((log.args.encryptedVoteHash ?? "").toString().toLowerCase())
      );
      const serverInputs = allMatched
        ? null
        : await fetchRoundInputs({
            roundId: e3Id,
            fromBlock: Number(fromBlock),
            program,
          }).catch(() => null);
      const serverPublishedCount = serverInputs?.length ?? 0;

      return committedLogs
        .map((log) => ({
          txHash: log.transactionHash,
          // `index` is a uint40, which viem decodes to `number` rather than `bigint`. Normalise so
          // the rendered key and label do not depend on the width the ABI happens to use.
          index: BigInt(log.args.index ?? 0),
          blockNumber: log.blockNumber,
          published:
            publishedHashes.has((log.args.encryptedVoteHash ?? "").toString().toLowerCase()) ||
            // Fallback for an older program whose events omit the hash: if the server reports as
            // many publications as there are commitments, everything committed is published.
            (serverPublishedCount > 0 && serverPublishedCount >= committedLogs.length),
        }))
        .reverse();
    },
    // Commitments close before the input window ends. After it ends, the list is final once every
    // committed ballot is published.
    refetchInterval: (query) => {
      const scope = queryClient.getQueryData<RoundScope>(roundScopeKey(e3Id));
      const closed = scope !== undefined && Date.now() / 1000 > Number(scope.inputEnd);
      return closed && query.state.data?.every((entry) => entry.published) ? false : 15_000;
    },
  });

  const explorerUrl = PUB_CHAIN.blockExplorers?.default?.url;
  const committed = entries?.length ?? 0;
  const published = entries?.filter((e) => e.published).length ?? 0;

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
          Each entry is an encrypted input recorded on-chain for this round. Votes, overrides and masks are
          indistinguishable. A ballot counts as soon as it is committed; publishing it to data availability follows
          separately and can take a few hours.
        </p>

        {/* The counts answer two different questions: "did my ballot register?" (committed) and
            "is the round ready to compute?" (published). Conflating them is what made a committed
            vote look lost. */}
        {committed > 0 && (
          <p className="text-xs text-neutral-500">
            {published} of {committed} published to data availability
            {published < committed ? ". The rest are awaiting publication." : "."}
          </p>
        )}

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
            <div key={entry.txHash + entry.index.toString()} className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">#{entry.index.toString()}</span>
              {explorerUrl ? (
                <a
                  href={`${explorerUrl}/tx/${entry.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary-400 hover:underline"
                >
                  {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-6)}
                </a>
              ) : (
                <span className="font-mono text-neutral-800">
                  {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-6)}
                </span>
              )}
              <span className={entry.published ? "text-success-600" : "text-neutral-400"}>
                {entry.published ? "published" : "committed"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </BallotActivity>
  );
}
