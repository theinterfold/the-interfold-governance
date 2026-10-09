import { useAccount, useReadContracts } from "wagmi";
import { CrispVotingAbi } from "../artifacts/CrispVoting";
import { iVotesAbi } from "../artifacts/iVotes";
import { PUB_CHAIN } from "@/constants";
import { usePrivatePair } from "./usePrivatePair";
import { bondedVotesAbi } from "@/artifacts/bondedVotes";
import { zeroAddress, type Address } from "viem";

export type CanCreateProposal = {
  /** Contract-accurate: the account meets `minProposerVotingPower` in *delegated* votes. */
  canCreate: boolean;
  /** The account holds tokens but its delegated voting power is below the threshold. */
  needsDelegation: boolean;
  /**
   * The address that votes with the account's bonded voting power. Delegation to itself does not
   * bring that voting power back, so `needsDelegation` stays false while this is set.
   */
  bondedDelegate?: Address;
  /** The account holds no voting tokens at all. */
  hasNoTokens: boolean;
  /** Whether the account has delegated to anyone (self or other). */
  isDelegated: boolean;
  /** Still fetching on-chain state. */
  isLoading: boolean;
  votingToken?: Address;
  minProposerVotingPower?: bigint;
  votes?: bigint;
  balance?: bigint;
  refetch: () => void;
};

/**
 * Mirrors the on-chain gate in `CrispVoting.createProposal`, which checks
 * `votingToken.getVotes(sender) >= minProposerVotingPower` — i.e. *delegated*
 * voting power, NOT raw token balance. A holder who never delegated (even to
 * themselves) has `getVotes == 0` and will be rejected, so we surface that as
 * `needsDelegation` rather than a hard "cannot create".
 */
export function useCanCreateProposal(): CanCreateProposal {
  const { address } = useAccount();
  const { body } = usePrivatePair();

  // Phase 1: read the plugin config (min power + voting token address).
  const { data: pluginReads, isLoading: pluginLoading } = useReadContracts({
    contracts: [
      {
        chainId: PUB_CHAIN.id,
        address: body,
        abi: CrispVotingAbi,
        functionName: "minProposerVotingPower",
      },
      {
        chainId: PUB_CHAIN.id,
        address: body,
        abi: CrispVotingAbi,
        functionName: "getVotingToken",
      },
    ],
  });

  const minProposerVotingPower = pluginReads?.[0]?.result as bigint | undefined;
  const votingToken = pluginReads?.[1]?.result as Address | undefined;

  // Phase 2: read the account's delegated votes, balance and delegate on that token.
  const {
    data: tokenReads,
    isLoading: tokenLoading,
    refetch,
  } = useReadContracts({
    query: { enabled: Boolean(address && votingToken) },
    contracts: [
      {
        chainId: PUB_CHAIN.id,
        address: votingToken,
        abi: iVotesAbi,
        functionName: "getVotes",
        args: [address as Address],
      },
      {
        chainId: PUB_CHAIN.id,
        address: votingToken,
        abi: iVotesAbi,
        functionName: "balanceOf",
        args: [address as Address],
      },
      {
        chainId: PUB_CHAIN.id,
        address: votingToken,
        abi: iVotesAbi,
        functionName: "delegates",
        args: [address as Address],
      },
      // Fails on a voting token without bonded delegation, which leaves it undefined.
      {
        chainId: PUB_CHAIN.id,
        address: votingToken,
        abi: bondedVotesAbi,
        functionName: "bondedDelegate",
        args: [address as Address],
      },
    ],
  });

  const votes = tokenReads?.[0]?.result as bigint | undefined;
  const balance = tokenReads?.[1]?.result as bigint | undefined;
  const delegate = tokenReads?.[2]?.result as Address | undefined;
  const bondedDelegate = tokenReads?.[3]?.result as Address | undefined;
  const bondedAway = Boolean(bondedDelegate && bondedDelegate !== zeroAddress);

  const isLoading = pluginLoading || (Boolean(address && votingToken) && tokenLoading);
  const isDelegated = Boolean(delegate && delegate !== zeroAddress);

  // No threshold configured => anyone connected can create.
  const noThreshold = minProposerVotingPower === 0n;

  const meetsThreshold = votes !== undefined && minProposerVotingPower !== undefined && votes >= minProposerVotingPower;

  const hasNoTokens = balance !== undefined && balance === 0n;

  // Holds enough tokens to pass the threshold, but delegated power is short —
  // self-delegation would fix it. Not when a bonded delegate holds the bonded voting power: the
  // balance still counts it, and self-delegation cannot bring it back.
  const wouldPassIfDelegated =
    !bondedAway &&
    balance !== undefined &&
    minProposerVotingPower !== undefined &&
    balance >= minProposerVotingPower &&
    !meetsThreshold;

  const canCreate = Boolean(address) && (noThreshold || meetsThreshold);

  return {
    canCreate,
    needsDelegation: Boolean(address) && !canCreate && wouldPassIfDelegated,
    bondedDelegate: bondedAway ? bondedDelegate : undefined,
    hasNoTokens: Boolean(address) && !canCreate && hasNoTokens,
    isDelegated,
    isLoading,
    votingToken,
    minProposerVotingPower,
    votes,
    balance,
    refetch,
  };
}
