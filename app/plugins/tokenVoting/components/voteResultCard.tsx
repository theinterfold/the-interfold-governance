import { formatUnits, parseAbi } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { type ProposalStatus } from "@aragon/ods";
import { ActionButton } from "@/components/input/actionButton";
import { ResultPanel, formatResultAmount, resultPercentages } from "@/components/proposalVoting/resultPanel";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { useWalletModal } from "@/hooks/useWalletModal";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS, PUB_TOKEN_SYMBOL } from "@/constants";
import { nextStageName } from "@/plugins/spp/utils/status";
import { useProposalExecute } from "../hooks/useProposalExecute";
import type { Proposal } from "../utils/types";

const votesAbi = parseAbi(["function getPastTotalSupply(uint256 timepoint) view returns (uint256)"]);

export function publicResultQuorum(total: bigint, required: bigint, supply?: bigint) {
  if (supply === undefined || supply <= 0n) return null;
  return {
    reached: total >= required,
    turnoutPct: (Number(total) / Number(supply)) * 100,
    requiredPct: (Number(required) / Number(supply)) * 100,
  };
}

/** Public votes use raw ERC-20 units and an absolute quorum; never apply CRISP scaling here. */
export function PublicVoteResultCard({
  proposal,
  proposalId,
  status,
  vetoStage,
}: {
  proposal: Proposal;
  proposalId: bigint;
  status?: ProposalStatus;
  vetoStage?: { vetoThreshold?: number | bigint };
}) {
  const decimals = useTokenDecimals();
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const { open: openWallet, isOpen: walletOpen } = useWalletModal();
  const connected = isConnected && !!address;
  const connecting = isConnecting || isReconnecting;
  const { data: supply } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_TOKEN_ADDRESS,
    abi: votesAbi,
    functionName: "getPastTotalSupply",
    args: [proposal.parameters.snapshotTimepoint],
  });
  const { executeProposal, canExecute, isConfirming } = useProposalExecute(proposalId);
  const values = [proposal.tally.yes, proposal.tally.no, proposal.tally.abstain];
  const total = values.reduce((sum, value) => sum + value, 0n);
  const percentages = resultPercentages(values);
  const options = ["Yes", "No", "Abstain"];
  const amount = (value: bigint) =>
    decimals === undefined ? "—" : formatResultAmount(Number(formatUnits(value, decimals)));

  return (
    <ResultPanel
      rows={values.map((value, index) => ({
        option: options[index],
        index,
        percentage: percentages[index],
        amount: `${amount(value)} ${PUB_TOKEN_SYMBOL}`,
      }))}
      total={`${amount(total)} ${PUB_TOKEN_SYMBOL}`}
      status={status}
      isEmpty={total === 0n}
      quorum={publicResultQuorum(total, proposal.parameters.minVotingPower, supply)}
      submitted={proposal.executed}
      action={
        canExecute ? (
          <ActionButton
            className="proposal-result-action mt-4 w-full"
            intent="vote"
            disabled={isConfirming || connecting || walletOpen}
            isLoading={isConfirming || connecting}
            onClick={() => {
              if (connected) executeProposal();
              else void openWallet();
            }}
          >
            {connecting
              ? "Connecting wallet…"
              : connected
                ? `Submit result & advance to ${nextStageName(vetoStage)} stage`
                : "Connect to submit result"}
          </ActionButton>
        ) : undefined
      }
    />
  );
}
