import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { Button, InputText } from "@aragon/ods";
import { formatEther, isAddress, type Address } from "viem";
import { MainSection } from "@/components/layout/main-section";
import { MissingContentView } from "@/components/MissingContentView";
import { AddressText } from "@/components/text/address";
import { useTokenVotes } from "@/hooks/useTokenVotes";
import { useDelegate } from "@/hooks/useDelegate";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { ADDRESS_ZERO } from "@/utils/evm";
import { compactNumber } from "@/utils/numbers";
import { DelegateList } from "../components/delegateList";

export default function Delegation() {
  const { address, isConnected } = useAccount();
  const { open } = useWeb3Modal();
  const { balance, votingPower, delegatesTo, refetch } = useTokenVotes(address);
  const { delegate, delegateToSelf, isConfirming } = useDelegate(() => setTimeout(() => refetch(), 1000 * 2));
  const [target, setTarget] = useState("");

  const delegatedToSelf = !!delegatesTo && !!address && delegatesTo.toLowerCase() === address.toLowerCase();
  const notDelegated = !delegatesTo || delegatesTo === ADDRESS_ZERO;
  const targetValid = isAddress(target);
  const fmt = (v?: bigint) => `${compactNumber(formatEther(v ?? 0n))} ${PUB_TOKEN_SYMBOL}`;

  return (
    <MainSection narrow>
      <div className="page-head w-full">
        <div>
          <div className="kicker mb-3">03 · Membership</div>
          <h1 className="display-title">Delegation</h1>
        </div>
      </div>

      {!isConnected || !address ? (
        <MissingContentView callToAction="Connect wallet" onClick={() => open()}>
          Connect your wallet to view and manage your {PUB_TOKEN_SYMBOL} voting power.
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
                  "Nobody — no voting power"
                ) : delegatedToSelf ? (
                  "Yourself"
                ) : (
                  <AddressText bold={false}>{delegatesTo}</AddressText>
                )
              }
            />
          </Card>

          <Card>
            <p className="text-base font-semibold text-neutral-800">Activate your own voting power</p>
            <p className="text-sm text-neutral-500">
              Delegate to yourself to vote with your {PUB_TOKEN_SYMBOL}. Voting power applies to proposals created after
              you delegate.
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

          <Card>
            <p className="text-base font-semibold text-neutral-800">Delegate to someone else</p>
            <p className="text-sm text-neutral-500">
              Hand your voting power to another address. They vote on your behalf until you change it.
            </p>
            <InputText placeholder="0x… delegate address" value={target} onChange={(e) => setTarget(e.target.value)} />
            <span>
              <Button
                size="md"
                variant="secondary"
                isLoading={isConfirming}
                disabled={!targetValid}
                onClick={() => delegate(target as Address)}
              >
                Delegate
              </Button>
            </span>
          </Card>

          <Card>
            <p className="text-base font-semibold text-neutral-800">Delegates</p>
            <p className="text-sm text-neutral-500">
              Addresses with active {PUB_TOKEN_SYMBOL} voting power. Delegate your power to any of them.
            </p>
            <DelegateList />
          </Card>
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
