import { parseAbi } from "viem";
import { useQuery } from "@tanstack/react-query";
import { PUB_CHAIN, PUB_CRISP_PROGRAM_ADDRESS, PUB_TOKEN_ADDRESS } from "@/constants";
import { publicClient } from "@/plugins/governance/utils/client";
import { iVotesAbi } from "../artifacts/iVotes";
import { generateMerkleTree, getScaledBalance, hashLeaf } from "@crisp-e3/sdk";
import { crispSdk } from "../utils/crispSdk";
import { voteScale } from "../utils/quorum";

import type { Address } from "viem";
import type { CreditsMode } from "../utils/types";

const pastSupplyAbi = parseAbi(["function getPastTotalSupply(uint256 timepoint) view returns (uint256)"]);

/**
 * Bump when the shape or content of the report changes.
 *
 * Results are cached with `staleTime: Infinity` AND persisted across reloads
 * (see `PersistQueryClientProvider` in `context/index.tsx`, gcTime 24h), so a code
 * change alone will keep serving a stale report — the query key must change too.
 */
const REPORT_VERSION = 2;

/** How many `getPastVotes` reads to bundle into a single multicall. */
const MULTICALL_BATCH = 200;

export interface EligibleVoterRow {
  address: Address;
  /** Scaled credits the CRISP server assigned this voter. */
  servedBalance: bigint;
  /** Raw voting power read from the token at the snapshot, or undefined if unread. */
  onChainPower?: bigint;
  /** `onChainPower` reduced by the same scaling the server applies. */
  expectedBalance?: bigint;
  /** servedBalance === expectedBalance. */
  matches: boolean;
}

export interface EligibleVotersReport {
  rows: EligibleVoterRow[];
  /** Sum of the scaled balances the server served. */
  servedTotal: bigint;
  /** `getPastTotalSupply` at the snapshot, raw units. */
  totalVotingPower?: bigint;
  /** Snapshot the CRISP server says it used (token-clock units). */
  serverSnapshot?: bigint;
  /** Snapshot recorded on-chain at proposal creation. */
  chainSnapshot?: bigint;
  /** Token the server says it read balances from. */
  serverToken?: string;
  /** Per-voter eligibility floor the server says it applied. */
  serverThreshold?: bigint;
  /** Eligibility root the CRISP program holds for this round, if readable. */
  onChainMerkleRoot?: bigint;
  checks: VerificationCheck[];
  mismatchCount: number;
}

export interface VerificationCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn" | "unknown";
  detail: string;
}

/**
 * Fetches the CRISP server's eligible-voter set and independently verifies it against
 * on-chain state.
 *
 * The server's own list proves nothing on its own — it is the server attesting to itself.
 * What makes it meaningful is re-deriving each voter's power from the token at the pinned
 * snapshot and diffing. This catches inflated or tampered weights and mis-declared
 * parameters. It does NOT catch omission (a holder the server silently dropped never
 * appears in the list to be checked), and it does not prove the E3 actually used this
 * set — only a merkle-root comparison does that, which needs `getRoundData` on the CRISP
 * program (shipping separately; see `rootCheckPending` below).
 */
export function useEligibleVoters(
  e3Id: bigint | undefined,
  opts: {
    /** `proposal.parameters.snapshotBlock` — token-clock units (a TIMESTAMP for FOLD). */
    chainSnapshot?: bigint;
    /** `proposal.parameters.minVotingPower` — the on-chain eligibility floor. */
    chainThreshold?: bigint;
    creditMode?: CreditsMode | number;
    decimals?: number;
    enabled?: boolean;
  }
) {
  const { chainSnapshot, chainThreshold, creditMode, decimals, enabled = true } = opts;

  return useQuery<EligibleVotersReport>({
    queryKey: ["crisp-eligible-voters", REPORT_VERSION, e3Id?.toString(), chainSnapshot?.toString(), decimals],
    // The set is immutable once the snapshot has passed.
    staleTime: Infinity,
    enabled: enabled && e3Id !== undefined && decimals !== undefined,
    queryFn: async () => {
      const id = Number(e3Id);

      const [holders, leafHashes, tokenDetails, onChainRound] = await Promise.all([
        crispSdk.getEligibleAddresses(id),
        crispSdk.getTokenHolderHashes(id).catch(() => [] as string[]),
        crispSdk.getRoundTokenDetails(id).catch(() => undefined),
        PUB_CRISP_PROGRAM_ADDRESS
          ? crispSdk.getOnChainRoundData(PUB_CRISP_PROGRAM_ADDRESS, id, PUB_CHAIN.id).catch(() => undefined)
          : undefined,
      ]);

      const rows: EligibleVoterRow[] = holders.map((h) => ({
        address: h.address as Address,
        servedBalance: BigInt(h.balance),
        matches: false,
      }));

      const serverSnapshot = tokenDetails?.snapshotBlock;
      // Prefer the snapshot the server declares; fall back to the on-chain one so the
      // read still happens when the server does not report it.
      const snapshot = serverSnapshot ?? chainSnapshot;
      // Scaling comes from the SDK so the per-row check and the leaf recomputation below
      // can never drift from each other (or from the server).
      const scaleDown = (raw: bigint) => getScaledBalance(raw, BigInt(decimals!));

      if (snapshot !== undefined && publicClient) {
        for (let i = 0; i < rows.length; i += MULTICALL_BATCH) {
          const batch = rows.slice(i, i + MULTICALL_BATCH);
          const results = await publicClient.multicall({
            contracts: batch.map((r) => ({
              address: PUB_TOKEN_ADDRESS,
              abi: iVotesAbi,
              functionName: "getPastVotes",
              args: [r.address, snapshot],
            })),
            allowFailure: true,
          });

          results.forEach((res, j) => {
            if (res.status !== "success") return;
            const power = res.result as unknown as bigint;
            const row = batch[j];
            row.onChainPower = power;
            row.expectedBalance = scaleDown(power);
            row.matches = row.expectedBalance === row.servedBalance;
          });
        }
      }

      let totalVotingPower: bigint | undefined;
      if (snapshot !== undefined && publicClient) {
        try {
          totalVotingPower = (await publicClient.readContract({
            address: PUB_TOKEN_ADDRESS,
            abi: pastSupplyAbi,
            functionName: "getPastTotalSupply",
            args: [snapshot],
          })) as unknown as bigint;
        } catch {
          totalVotingPower = undefined;
        }
      }

      const servedTotal = rows.reduce((sum, r) => sum + r.servedBalance, 0n);
      const mismatchCount = rows.filter((r) => r.onChainPower !== undefined && !r.matches).length;
      const unread = rows.filter((r) => r.onChainPower === undefined).length;

      const checks: VerificationCheck[] = [];

      checks.push(
        unread > 0
          ? {
              id: "balances",
              label: "Balances match the token at the snapshot",
              status: "warn",
              detail: `${rows.length - unread}/${rows.length} checked — ${unread} could not be read`,
            }
          : mismatchCount === 0
            ? {
                id: "balances",
                label: "Balances match the token at the snapshot",
                status: "pass",
                detail: `All ${rows.length} verified against getPastVotes`,
              }
            : {
                id: "balances",
                label: "Balances match the token at the snapshot",
                status: "fail",
                detail: `${mismatchCount} of ${rows.length} disagree with on-chain voting power`,
              }
      );

      // The tally is compared against getPastTotalSupply for quorum, so the eligible set
      // can never legitimately exceed it.
      if (totalVotingPower !== undefined) {
        const servedRaw = servedTotal * voteScale(creditMode, decimals!);
        checks.push({
          id: "supply",
          label: "Total credits do not exceed voting power at the snapshot",
          status: servedRaw <= totalVotingPower ? "pass" : "fail",
          detail: `${servedRaw} vs ${totalVotingPower} raw units`,
        });
      }

      // A server snapshot that differs from the one the contract recorded means quorum is
      // measured against a different population than the one that was allowed to vote.
      if (serverSnapshot !== undefined && chainSnapshot !== undefined) {
        checks.push({
          id: "snapshot",
          label: "Server snapshot matches the on-chain snapshot",
          status: serverSnapshot === chainSnapshot ? "pass" : "warn",
          detail:
            serverSnapshot === chainSnapshot
              ? `Both at ${chainSnapshot}`
              : `server ${serverSnapshot} vs chain ${chainSnapshot}`,
        });
      }

      if (tokenDetails?.tokenAddress) {
        const same = tokenDetails.tokenAddress.toLowerCase() === PUB_TOKEN_ADDRESS.toLowerCase();
        checks.push({
          id: "token",
          label: "Server read the configured governance token",
          status: same ? "pass" : "fail",
          detail: same ? PUB_TOKEN_ADDRESS : `server used ${tokenDetails.tokenAddress}`,
        });
      }

      if (tokenDetails?.threshold !== undefined && chainThreshold !== undefined) {
        const same = tokenDetails.threshold === chainThreshold;
        checks.push({
          id: "threshold",
          label: "Eligibility threshold matches the proposal",
          status: same ? "pass" : "warn",
          detail: same ? `${chainThreshold}` : `server ${tokenDetails.threshold} vs chain ${chainThreshold}`,
        });
      }

      // Round data read straight from the CRISP program (Crisp.sol).
      if (onChainRound) {
        // A zero root means the round carries no eligibility commitment at all — the set
        // above is then server-asserted with nothing on-chain binding it.
        checks.push({
          id: "root",
          label: "Round commits to an eligibility merkle root",
          status: onChainRound.merkleRoot !== 0n ? "pass" : "fail",
          detail:
            onChainRound.merkleRoot !== 0n
              ? `0x${onChainRound.merkleRoot.toString(16)}`
              : "root is zero — nothing binds this set on-chain",
        });

        // INV-31: this app is fixed at 3 options / CUSTOM credits.
        checks.push({
          id: "shape",
          label: "Round is a 3-option token vote",
          status: onChainRound.numOptions === 3n ? "pass" : "fail",
          detail: `numOptions ${onChainRound.numOptions}, creditMode ${onChainRound.creditMode}`,
        });
      }

      // --- Root recomputation -------------------------------------------------
      // Rebuild the census tree from the served leaves with the SDK's own LeanIMT +
      // Poseidon (the same construction the circuit uses, so this cannot drift) and
      // compare against the root the CRISP program committed for this round.
      const leaves = leafHashes.map((h) => BigInt(h.startsWith("0x") ? h : `0x${h}`));

      if (!leaves.length) {
        checks.push({
          id: "root-recompute",
          label: "Served set reproduces the on-chain root",
          status: "warn",
          detail: "The server returned no census leaves",
        });
      } else if (onChainRound === undefined) {
        checks.push({
          id: "root-recompute",
          label: "Served set reproduces the on-chain root",
          status: "unknown",
          detail: "Could not read the round's root from the CRISP program",
        });
      } else {
        let recomputed: bigint | undefined;
        try {
          recomputed = generateMerkleTree(leaves).root;
        } catch {
          recomputed = undefined;
        }

        checks.push(
          recomputed === undefined
            ? {
                id: "root-recompute",
                label: "Served set reproduces the on-chain root",
                status: "warn",
                detail: "Could not rebuild the tree from the served leaves",
              }
            : {
                id: "root-recompute",
                label: "Served set reproduces the on-chain root",
                status: recomputed === onChainRound.merkleRoot ? "pass" : "fail",
                detail:
                  recomputed === onChainRound.merkleRoot
                    ? `${leaves.length} leaves rebuild the committed root`
                    : `rebuilt 0x${recomputed.toString(16)} != on-chain 0x${onChainRound.merkleRoot.toString(16)}`,
              }
        );
      }

      // --- Leaf contents ------------------------------------------------------
      // The root proves the served leaves are the committed ones; this proves those
      // leaves encode the balances the token actually reports at the snapshot.
      // Membership rather than index, so leaf ordering is irrelevant.
      if (leaves.length && decimals !== undefined) {
        const leafSet = new Set(leaves);
        const checkable = rows.filter((r) => r.onChainPower !== undefined);
        const missing = checkable.filter((r) => !leafSet.has(hashLeaf(r.address, scaleDown(r.onChainPower!)))).length;

        checks.push({
          id: "leaf-contents",
          label: "Census leaves encode on-chain balances",
          status: checkable.length === 0 ? "unknown" : missing === 0 ? "pass" : "fail",
          detail:
            checkable.length === 0
              ? "No balances could be read to compare"
              : missing === 0
                ? `All ${checkable.length} leaves reproduced from on-chain balances`
                : `${missing} of ${checkable.length} have no matching leaf`,
        });
      }

      return {
        rows,
        servedTotal,
        totalVotingPower,
        serverSnapshot,
        chainSnapshot,
        serverToken: tokenDetails?.tokenAddress,
        serverThreshold: tokenDetails?.threshold,
        onChainMerkleRoot: onChainRound?.merkleRoot,
        checks,
        mismatchCount,
      };
    },
  });
}
