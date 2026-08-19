import { type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { PUB_CHAIN, PUB_VE_LOCKER_ADDRESS } from "@/constants";
import { votingEscrowAbi } from "../artifacts/votingEscrow";
import { exitQueueAbi } from "../artifacts/exitQueue";

/**
 * Resolves the escrow's satellite contracts and static parameters. Only the escrow address
 * comes from the env — the lock NFT, exit queue and IVotes adapter are read off it, so the
 * app can never pair a locker with the wrong satellites.
 */
export function useVeEscrow() {
  const { data } = useReadContracts({
    contracts: [
      { chainId: PUB_CHAIN.id, address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "lockNFT" },
      { chainId: PUB_CHAIN.id, address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "queue" },
      { chainId: PUB_CHAIN.id, address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "ivotesAdapter" },
      { chainId: PUB_CHAIN.id, address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "minDeposit" },
      { chainId: PUB_CHAIN.id, address: PUB_VE_LOCKER_ADDRESS, abi: votingEscrowAbi, functionName: "totalLocked" },
    ],
    query: { enabled: !!PUB_VE_LOCKER_ADDRESS, staleTime: Infinity },
  });

  const queueAddress = data?.[1].result as Address | undefined;

  const { data: cooldownData } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: queueAddress,
    abi: exitQueueAbi,
    functionName: "cooldown",
    query: { enabled: !!queueAddress, staleTime: Infinity },
  });

  return {
    escrow: PUB_VE_LOCKER_ADDRESS,
    lockNft: data?.[0].result as Address | undefined,
    queue: queueAddress,
    adapter: data?.[2].result as Address | undefined,
    minDeposit: data?.[3].result as bigint | undefined,
    totalLocked: data?.[4].result as bigint | undefined,
    /** Exit-queue cooldown in seconds, between beginWithdrawal and withdraw. */
    cooldown: cooldownData === undefined ? undefined : Number(cooldownData),
  };
}
