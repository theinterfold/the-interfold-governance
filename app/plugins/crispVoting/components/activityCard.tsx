import { useQuery } from "@tanstack/react-query";
import { parseAbi, parseAbiItem, type Address } from "viem";
import { PUB_CHAIN, PUB_CRISP_VOTING_PLUGIN_ADDRESS, PUB_DEPLOYMENT_BLOCK } from "@/constants";
import { fetchRoundInputs } from "@/utils/crispIndexer";
import { publicClient } from "../utils/client";
import { CrispVotingAbi } from "../artifacts/CrispVoting";

// Minimal slice of IInterfold.getE3 — only the fields before and including e3Program matter here.
const interfoldAbi = parseAbi([
  "struct E3 { uint256 seed; uint8 committeeSize; uint256 requestBlock; uint256[2] inputWindow; bytes32 encryptionSchemeId; address e3Program; uint8 paramSet; bytes customParams; address decryptionVerifier; address pkVerifier; bytes32 committeePublicKey; bytes32 ciphertextOutput; bytes plaintextOutput; address requester; bool proofAggregationEnabled; }",
  "function getE3(uint256 e3Id) view returns (E3 memory e3)",
]);

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

/**
 * Encrypted ballot activity for a CRISP round: every encrypted input recorded on-chain for this
 * e3Id, with its data-availability state. Inputs are indistinguishable (vote, override or mask) —
 * this only shows that activity is happening. The program address is resolved on-chain per round:
 * CrispVoting.interfold() -> getE3(e3Id).e3Program.
 */
export function ActivityCard({ e3Id }: { e3Id: bigint }) {
  const { data: entries, isLoading } = useQuery<ActivityEntry[]>({
    queryKey: ["crisp-activity", e3Id.toString()],
    queryFn: async () => {
      const interfold = (await publicClient.readContract({
        address: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
        abi: CrispVotingAbi,
        functionName: "interfold",
      })) as Address;

      const e3 = await publicClient.readContract({
        address: interfold,
        abi: interfoldAbi,
        functionName: "getE3",
        args: [e3Id],
      });

      const fromBlock = BigInt(PUB_DEPLOYMENT_BLOCK);

      // Committed is the source of truth for "a ballot exists". Read it from the chain rather
      // than the server: `/rounds/inputs` reports PUBLISHED inputs only, so it answers `[]` for a
      // round whose ballots are still awaiting data availability.
      const [committedLogs, publishedLogs] = await Promise.all([
        publicClient.getLogs({
          address: e3.e3Program,
          event: inputCommittedEvent,
          args: { e3Id },
          fromBlock,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: e3.e3Program,
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

      // The server still supplies transaction hashes for published inputs when it is reachable,
      // but it can only ever be a superset check — never the count itself.
      const serverInputs = await fetchRoundInputs({
        roundId: e3Id,
        fromBlock: PUB_DEPLOYMENT_BLOCK,
        program: e3.e3Program,
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
    refetchInterval: 15_000,
  });

  const explorerUrl = PUB_CHAIN.blockExplorers?.default?.url;
  const committed = entries?.length ?? 0;
  const published = entries?.filter((e) => e.published).length ?? 0;

  return (
    <div className="flex flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-4 xl:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-800">Encrypted ballot activity</p>
        <span className="text-sm text-neutral-500">{committed}</span>
      </div>
      <p className="text-xs text-neutral-500">
        Each entry is an encrypted input recorded on-chain for this round — votes, overrides and masks are
        indistinguishable. A ballot counts as soon as it is committed; publishing it to data availability follows
        separately and can take a few hours.
      </p>

      {/* The counts answer two different questions: "did my ballot register?" (committed) and
          "is the round ready to compute?" (published). Conflating them is what made a committed
          vote look lost. */}
      {committed > 0 && (
        <p className="text-xs text-neutral-500">
          {published} of {committed} published to data availability
          {published < committed ? " — the rest are awaiting publication." : "."}
        </p>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {!isLoading && committed === 0 && <p className="text-sm text-neutral-500">No encrypted inputs posted yet.</p>}

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
  );
}
