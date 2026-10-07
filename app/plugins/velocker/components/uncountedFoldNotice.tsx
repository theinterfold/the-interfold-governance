import Link from "next/link";
import { formatUnits, isAddress, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import {
  PUB_BONDED_VOTES_ADDRESS,
  PUB_CHAIN,
  PUB_TOKEN_ADDRESS,
  PUB_TOKEN_SYMBOL,
  PUB_VE_LOCKER_ADDRESS,
} from "@/constants";
import { bondedVotesAbi } from "@/artifacts/bondedVotes";
import { AddressText } from "@/components/text/address";
import { SelfDelegateLink } from "@/components/text/selfDelegate";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { ADDRESS_ZERO, equalAddresses } from "@/utils/evm";
import { compactNumber } from "@/utils/numbers";
import { foldLockAbi } from "../artifacts/foldLock";
import { votingEscrowAbi } from "../artifacts/votingEscrow";
import { PowerWarning } from "./powerWarning";

/**
 * Names the FOLD of an account that gives it no voting power under the voting escrow, and what
 * makes that FOLD count.
 *
 * `BondedVotes` counts escrow locks only through the adapter's delegation, and never counts
 * unlocked wallet FOLD. FOLD that is still vesting and bonded FOLD count without either, unless the
 * owner gave them to a bonded delegate. So an account can vote while part of its FOLD does not
 * count for it, and the fix depends on the part: unlocked FOLD must be locked, a lock must be
 * delegated, and bonded delegation must be stopped on the Voting power page.
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
  // An adapter without bonded delegation reverts here, and the bonded line stays hidden.
  const { data: bondedDelegate } = useReadContract({
    chainId: PUB_CHAIN.id,
    address: PUB_BONDED_VOTES_ADDRESS,
    abi: bondedVotesAbi,
    functionName: "bondedDelegate",
    args: [address!],
    query: { enabled: !!address && isAddress(PUB_BONDED_VOTES_ADDRESS), retry: false },
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
  const bondedAway = !!bondedDelegate && !equalAddresses(bondedDelegate, ADDRESS_ZERO);
  if (unlocked === 0n && undelegated === 0n && !delegatedElsewhere && !bondedAway) return null;

  const fmt = (v: bigint) => `${compactNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;
  const link = "underline underline-offset-2";
  return (
    <PowerWarning title={`Some of your ${PUB_TOKEN_SYMBOL} does not count`}>
      {unlocked > 0n && (
        <span className="block">
          {fmt(unlocked)} in your wallet is not locked.{" "}
          <Link href="/plugins/lock/#/" className={link}>
            Lock it
          </Link>{" "}
          to vote with it.
        </span>
      )}
      {undelegated > 0n && (
        <span className="block">
          {fmt(undelegated)} in the voting escrow is not delegated.{" "}
          <SelfDelegateLink label="Delegate it to yourself" /> to vote with it.
        </span>
      )}
      {delegatedElsewhere && (
        <span className="block">
          Your locked {PUB_TOKEN_SYMBOL} votes through <AddressText bold={false}>{delegatesTo}</AddressText>.{" "}
          <SelfDelegateLink label="Delegate it to yourself" /> to vote with it yourself.
        </span>
      )}
      {bondedAway && (
        <span className="block">
          Your bonded and vesting {PUB_TOKEN_SYMBOL} votes through{" "}
          <AddressText bold={false}>{bondedDelegate}</AddressText>.{" "}
          <Link href="/plugins/lock/#/" className={link}>
            Stop the delegation
          </Link>{" "}
          to vote with it yourself.
        </span>
      )}
      <span className="block">A change counts only for proposals created after it.</span>
    </PowerWarning>
  );
}
