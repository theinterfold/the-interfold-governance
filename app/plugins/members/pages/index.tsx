import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { Button } from "@aragon/ods";
import { formatUnits } from "viem";
import { MainSection } from "@/components/layout/main-section";
import { MissingContentView } from "@/components/MissingContentView";
import { AddressText } from "@/components/text/address";
import { BondedDelegationCards } from "@/components/cards/BondedDelegationCards";
import { useBondedDelegation } from "@/hooks/useBondedDelegation";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { useDelegate } from "@/hooks/useDelegate";
import { PUB_ENABLE_LOCKING, PUB_TOKEN_SYMBOL } from "@/constants";
import { ADDRESS_ZERO } from "@/utils/evm";
import { compactNumber } from "@/utils/numbers";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";

export default function Delegation() {
  const { address, isConnected } = useAccount();
  const { balance, votingPower, delegatesTo, refetch } = useTokenVotes(address);
  const onChanged = () => setTimeout(() => refetch(), 1000 * 2);
  const { delegateToSelf, isConfirming } = useDelegate(onChanged);
  const bonded = useBondedDelegation(address, onChanged);

  const delegatedToSelf = !!delegatesTo && !!address && delegatesTo.toLowerCase() === address.toLowerCase();
  const notDelegated = !delegatesTo || delegatesTo === ADDRESS_ZERO;
  const decimals = useTokenDecimals();
  const fmt = (v?: bigint) =>
    decimals === undefined ? "-" : `${compactNumber(formatUnits(v ?? 0n, decimals))} ${PUB_TOKEN_SYMBOL}`;

  return (
    <MainSection narrow={true}>
      <div className="page-head w-full">
        <div>
          <h1 className="display-title">Voting power</h1>
        </div>
      </div>

      <p className="form-intro">
        {PUB_ENABLE_LOCKING
          ? `Voting power in the Interfold comes from ${PUB_TOKEN_SYMBOL} that is committed, not just held: ` +
            `${PUB_TOKEN_SYMBOL} locked in the voting escrow, bonded as ciphernode collateral, or still under a ` +
            `vesting lock. Delegate your locked ${PUB_TOKEN_SYMBOL} to yourself to activate it. ` +
            `Bonded and vesting ${PUB_TOKEN_SYMBOL} count for their owner without delegation. ` +
            `Delegating never moves your tokens.`
          : `Voting power comes from ${PUB_TOKEN_SYMBOL} that you delegate to yourself. ` +
            `Delegate once to vote with your own balance. ` +
            `${bonded.supported ? `Bonded ${PUB_TOKEN_SYMBOL} counts for its owner without delegation. ` : ""}` +
            `Delegating never moves your tokens.`}
      </p>

      {!isConnected || !address ? (
        <MissingContentView>
          Connect your wallet (top right) to view and manage your {PUB_TOKEN_SYMBOL} voting power.
        </MissingContentView>
      ) : (
        <div className="flex flex-col gap-y-6">
          <Card>
            <Row label={`${PUB_TOKEN_SYMBOL} balance`} value={fmt(balance)} />
            <Row label="Voting power" value={fmt(votingPower)} />
            <Row
              label="Delegating to"
              value={
                notDelegated ? (
                  // "Nobody" turns off one source of voting power: the locks under the velocker, the
                  // wallet balance without it. Bonded FOLD, and vesting FOLD under the velocker, do not
                  // follow this delegation. They count for their owner.
                  PUB_ENABLE_LOCKING ? (
                    "Nobody (locks not activated)"
                  ) : (
                    "Nobody (balance not activated)"
                  )
                ) : (
                  <AddressText bold={false}>{delegatesTo}</AddressText>
                )
              }
            />
          </Card>

          <Card>
            <p className="text-base font-semibold text-neutral-800">Activate your own voting power</p>
            <p className="text-sm text-neutral-500">
              {PUB_ENABLE_LOCKING
                ? `Delegate to yourself to vote with your locked ${PUB_TOKEN_SYMBOL}. Locks carry no voting power until you delegate. This applies to all your locks, current and future. If you delegated to another address, this takes your voting power back.`
                : `Delegate to yourself to vote with your ${PUB_TOKEN_SYMBOL}. Voting power applies to proposals created after you delegate. If you delegated to another address, this takes your voting power back.`}
            </p>
            <span>
              <Button
                size="md"
                variant="primary"
                isLoading={isConfirming}
                disabled={delegatedToSelf}
                onClick={() => delegateToSelf()}
              >
                {delegatedToSelf ? "Already self-delegated" : "Delegate to myself"}
              </Button>
            </span>
          </Card>
          <BondedDelegationCards address={address} bonded={bonded} headingPlacement="inside" />
        </div>
      )}
    </MainSection>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-4 xl:p-6">{children}</div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="font-semibold text-neutral-800">{value}</span>
    </div>
  );
}
