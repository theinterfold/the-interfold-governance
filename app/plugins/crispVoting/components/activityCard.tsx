import { useQuery } from "@tanstack/react-query";
import { parseAbi, parseAbiItem, type Address } from "viem";
import { PUB_CHAIN, PUB_CRISP_VOTING_PLUGIN_ADDRESS, PUB_DEPLOYMENT_BLOCK } from "@/constants";
import { publicClient } from "../utils/client";
import { CrispVotingAbi } from "../artifacts/CrispVoting";

// Minimal slice of IInterfold.getE3 — only the fields before and including e3Program matter here.
const interfoldAbi = parseAbi([
  "struct E3 { uint256 seed; uint8 committeeSize; uint256 requestBlock; uint256[2] inputWindow; bytes32 encryptionSchemeId; address e3Program; uint8 paramSet; bytes customParams; address decryptionVerifier; address pkVerifier; bytes32 committeePublicKey; bytes32 ciphertextOutput; bytes plaintextOutput; address requester; bool proofAggregationEnabled; }",
  "function getE3(uint256 e3Id) view returns (E3 memory e3)",
]);

// CRISPProgram's event (verified on-chain): NOT the 4-field IInterfold variant.
const inputPublishedEvent = parseAbiItem("event InputPublished(uint256 indexed e3Id, bytes data, uint256 index)");

interface ActivityEntry {
  txHash: string;
  index: bigint;
  blockNumber: bigint;
}

/**
 * Encrypted ballot activity for a CRISP round: every `publishInput` transaction
 * posted to the round's E3 program contract for this e3Id. Inputs are
 * indistinguishable (vote, override or mask) — this only shows that activity
 * is happening. The program address is resolved on-chain per round:
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

      const logs = await publicClient.getLogs({
        address: e3.e3Program,
        event: inputPublishedEvent,
        args: { e3Id },
        fromBlock: BigInt(PUB_DEPLOYMENT_BLOCK),
        toBlock: "latest",
      });

      return logs
        .map((log) => ({
          txHash: log.transactionHash,
          index: log.args.index ?? 0n,
          blockNumber: log.blockNumber,
        }))
        .reverse();
    },
    refetchInterval: 15_000,
  });

  const explorerUrl = PUB_CHAIN.blockExplorers?.default?.url;

  return (
    <div className="flex flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-4 xl:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-800">Encrypted ballot activity</p>
        <span className="text-sm text-neutral-500">{entries?.length ?? 0}</span>
      </div>
      <p className="text-xs text-neutral-500">
        Each entry is an encrypted input posted on-chain for this round — votes, overrides and masks are
        indistinguishable.
      </p>

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {!isLoading && (!entries || entries.length === 0) && (
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
            <span className="text-neutral-500">block {entry.blockNumber.toString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
