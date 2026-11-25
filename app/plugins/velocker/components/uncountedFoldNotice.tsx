import Link from "next/link";
import type { ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react";
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
import { displayNumber } from "@/utils/numbers";
import { foldLockAbi } from "../artifacts/foldLock";
import { votingEscrowAbi } from "../artifacts/votingEscrow";
import { BallotDisclosure } from "@/components/proposalVoting/ballotDisclosure";
import styles from "./uncountedFoldNotice.module.css";

/**
 * Names the FOLD of an account that gives it no voting power under the voting escrow, and what
 * makes that FOLD count.
 *
 * `BondedVotes` counts escrow locks only through the adapter's delegation, and never counts
 * unlocked wallet FOLD. FOLD that is still vesting and bonded FOLD count without either, unless the
 * owner gave them to a bonded delegate. So an account can vote while part of its FOLD does not
 * count for it, and the fix depends on the part: unlocked FOLD must be locked, a lock must be
 * delegated to the account itself, and bonded delegation must be stopped on the Voting power page.
 *
 * @param delegatesTo The adapter's delegate for `address`, from `useTokenVotes`.
 */
export function UncountedFoldNotice({
  address,
  delegatesTo,
  children,
}: {
  address?: Address;
  delegatesTo?: Address;
  /** Embed the same resolved warning in the ballot's calculation help. */
  children?: (warning: ReactNode | null) => ReactNode;
}) {
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
    return children ? children(null) : null;
  }

  const noDelegate = equalAddresses(delegatesTo, ADDRESS_ZERO);
  const undelegated = noDelegate ? locked : 0n;
  const delegatedElsewhere = locked > 0n && !noDelegate && !equalAddresses(delegatesTo, address);
  const bondedAway = !!bondedDelegate && !equalAddresses(bondedDelegate, ADDRESS_ZERO);
  if (unlocked === 0n && undelegated === 0n && !delegatedElsewhere && !bondedAway) return children ? children(null) : null;

  const fmt = (v: bigint) => `${displayNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;
  const link = "underline underline-offset-2";
  const details = (
    <>
      {unlocked > 0n && (
        <span className="block">
          {fmt(unlocked)} in your wallet is not locked.{" "}
          <Link href="/plugins/lock/?action=lock#/" className={link}>
            Lock it
          </Link>{" "}
          to vote with it.
        </span>
      )}
      {undelegated > 0n && (
        <span className="block">
          {fmt(undelegated)} in the voting escrow is not delegated. <SelfDelegateLink label="Delegate it to yourself" />{" "}
          to vote with it.
        </span>
      )}
      {delegatedElsewhere && (
        <span className="block">
          {displayNumber(formatUnits(locked, decimals))} locked {PUB_TOKEN_SYMBOL} votes through{" "}
          <AddressText bold={false}>{delegatesTo}</AddressText>. <SelfDelegateLink label="Delegate to yourself" /> to
          vote with it.
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
      <span className={`block ${styles.footnote}`}>
        A change counts only for proposals created after it.
      </span>
    </>
  );

  if (children) return children(
    <section className={styles.help} aria-label={`Some ${PUB_TOKEN_SYMBOL} does not count`}>
      <h4>Some {PUB_TOKEN_SYMBOL} does not count</h4>
      <div className={styles.helpDetails}>{details}</div>
    </section>
  );

  return (
    <BallotDisclosure
      className={`power-warning ${styles.notice}`}
      title={(chevron) => (
        <span className={styles.summary}>
          <WarningCircle size={18} weight="regular" aria-hidden="true" focusable="false" />
          <span>Some {PUB_TOKEN_SYMBOL} does not count</span>
          {chevron}
        </span>
      )}
    >
      <div className={styles.details}>{details}</div>
    </BallotDisclosure>
  );
}
