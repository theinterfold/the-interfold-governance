import { AlertCard } from "@aragon/ods";
import Link from "next/link";
import { formatUnits, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS, PUB_TOKEN_SYMBOL, PUB_VE_LOCKER_ADDRESS } from "@/constants";
import { AddressText } from "@/components/text/address";
import { SelfDelegateLink } from "@/components/text/selfDelegate";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { ADDRESS_ZERO, equalAddresses } from "@/utils/evm";
import { compactNumber } from "@/utils/numbers";
import { foldLockAbi } from "../artifacts/foldLock";
import { votingEscrowAbi } from "../artifacts/votingEscrow";

/**
 * Names the FOLD of an account that gives it no voting power under the voting escrow, and what
 * makes that FOLD count.
 *
 * `BondedVotes` counts escrow locks only through the adapter's delegation, and never counts
 * unlocked wallet FOLD. FOLD that is still vesting and bonded FOLD count without either. So an
 * account can vote while part of its FOLD does not count, and the fix depends on the part: unlocked
 * FOLD must be locked, and a lock must be delegated.
 *
 * @param delegatesTo The adapter's delegate for `address`, from `useTokenVotes`.
 */
export function UncountedFoldNotice({ address, delegatesTo }: { address?: Address; delegatesTo?: Address }) {
  const decimals = useTokenDecimals();
  const { data } = useReadContracts({
    contracts: [
      {
        chainId: PUB_CHAIN.id,
        address: PUB_TOKEN_ADDRESS,
        abi: foldLockAbi,
        functionName: "transferableBalanceOf",
        args: [address!],
      },
      {
        chainId: PUB_CHAIN.id,
        address: PUB_VE_LOCKER_ADDRESS,
        abi: votingEscrowAbi,
        functionName: "votingPowerForAccount",
        args: [address!],
      },
    ],
    query: { enabled: !!address },
  });
  // Unlocked wallet FOLD: what the vesting schedule no longer holds, net of any bond.
  const unlocked = data?.[0].result;
  const locked = data?.[1].result;
  if (
    !address ||
    delegatesTo === undefined ||
    unlocked === undefined ||
    locked === undefined ||
    decimals === undefined
  ) {
    return null;
  }

  const noDelegate = equalAddresses(delegatesTo, ADDRESS_ZERO);
  const undelegated = noDelegate ? locked : 0n;
  const delegatedElsewhere = locked > 0n && !noDelegate && !equalAddresses(delegatesTo, address);
  if (unlocked === 0n && undelegated === 0n && !delegatedElsewhere) return null;

  const fmt = (v: bigint) => `${compactNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;
  return (
    <AlertCard
      variant="info"
      message={`Some of your ${PUB_TOKEN_SYMBOL} does not count`}
      description={
        <span className="flex flex-col gap-y-1 text-sm">
          {unlocked > 0n && (
            <span>
              {fmt(unlocked)} in your wallet is not locked.{" "}
              <Link href="/plugins/lock/#/" className="!text-sm text-primary-400 hover:underline">
                Lock it
              </Link>{" "}
              to vote with it.
            </span>
          )}
          {undelegated > 0n && (
            <span>
              {fmt(undelegated)} in the voting escrow is not delegated.{" "}
              <SelfDelegateLink label="Delegate it to yourself" /> to vote with it.
            </span>
          )}
          {delegatedElsewhere && (
            <span>
              Your locked {PUB_TOKEN_SYMBOL} votes through <AddressText bold={false}>{delegatesTo}</AddressText>.{" "}
              <SelfDelegateLink label="Delegate it to yourself" /> to vote with it yourself.
            </span>
          )}
          <span>A change counts only for proposals created after it.</span>
        </span>
      }
    />
  );
}
