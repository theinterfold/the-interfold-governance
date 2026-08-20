import { isAddress, type Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { TokenVotingAbi } from "../artifacts/TokenVoting.sol";
import { iVotesAbi } from "@/plugins/crispVoting/artifacts/iVotes";
import { PUB_CHAIN, PUB_TOKEN_VOTING_PLUGIN_ADDRESS } from "@/constants";

export type CanCreateProposal = {
  /** Contract-accurate: the account meets `minProposerVotingPower` in *delegated* votes. */
  canCreate: boolean;
  /** The account holds enough tokens but its delegated voting power is below the threshold. */
  needsDelegation: boolean;
  /** The account holds no voting tokens at all. */
  hasNoTokens: boolean;
  /** Still fetching on-chain state. */
  isLoading: boolean;
  minProposerVotingPower?: bigint;
  votes?: bigint;
  balance?: bigint;
};

/**
 * Mirrors the on-chain gate in TokenVoting.createProposal, which checks
 * `getVotes(sender)` — i.e. *delegated* voting power, NOT raw token balance.
 * A holder who never delegated (even to themselves) has `getVotes == 0` and
 * will be rejected, so we surface that as `needsDelegation` rather than a
 * hard "cannot create".
 */
export function useCanCreateProposal(): CanCreateProposal {
  const { address } = useAccount();
  const pluginInstalled = isAddress(PUB_TOKEN_VOTING_PLUGIN_ADDRESS);

  const { data: pluginReads, isLoading: pluginLoading } = useReadContracts({
    query: { enabled: pluginInstalled },
    contracts: [
      {
        chainId: PUB_CHAIN.id,
        address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
        abi: TokenVotingAbi,
        functionName: "minProposerVotingPower",
      },
      {
        chainId: PUB_CHAIN.id,
        address: PUB_TOKEN_VOTING_PLUGIN_ADDRESS,
        abi: TokenVotingAbi,
        functionName: "getVotingToken",
      },
    ],
  });

  const minProposerVotingPower = pluginReads?.[0]?.result as bigint | undefined;
  const votingToken = pluginReads?.[1]?.result as Address | undefined;

  const { data: tokenReads, isLoading: tokenLoading } = useReadContracts({
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
    ],
  });

  const votes = tokenReads?.[0]?.result as bigint | undefined;
  const balance = tokenReads?.[1]?.result as bigint | undefined;

  const isLoading = pluginInstalled && (pluginLoading || (Boolean(address && votingToken) && tokenLoading));

  const noThreshold = minProposerVotingPower === 0n;
  const meetsThreshold = votes !== undefined && minProposerVotingPower !== undefined && votes >= minProposerVotingPower;
  const hasNoTokens = balance !== undefined && balance === 0n;

  // Holds enough tokens to pass the threshold, but delegated power is short —
  // self-delegation would fix it.
  const wouldPassIfDelegated =
    balance !== undefined &&
    minProposerVotingPower !== undefined &&
    balance >= minProposerVotingPower &&
    !meetsThreshold;

  const canCreate = pluginInstalled && Boolean(address) && (noThreshold || meetsThreshold);

  return {
    canCreate,
    needsDelegation: Boolean(address) && !canCreate && wouldPassIfDelegated,
    hasNoTokens: Boolean(address) && !canCreate && hasNoTokens,
    isLoading,
    minProposerVotingPower,
    votes,
    balance,
  };
}
