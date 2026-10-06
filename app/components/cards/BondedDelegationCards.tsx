import { useState, type ReactNode } from "react";
import { Button, InputText, Tag } from "@aragon/ods";
import { formatUnits, type Address } from "viem";
import { AddressText } from "@/components/text/address";
import { EnsMember } from "@/components/text/ensMember";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import type { BondedAccount, BondedDelegation } from "@/hooks/useBondedDelegation";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { bondedDelegateTarget } from "@/utils/bondedDelegation";
import { compactNumber } from "@/utils/numbers";

const CARD = "flex flex-col gap-y-3 rounded-xl border border-neutral-100 bg-neutral-0 p-4 xl:p-6";

/**
 * Bonded delegation on `BondedVotes`, from both sides: a card for the account as an owner that
 * gives its bonded voting power to a delegate, and a card for the account as a delegate that
 * represents owners and answers their requests.
 *
 * Renders nothing on an adapter without bonded delegation. The owner card shows only to an account
 * with bonded voting power or a delegation to manage, and the delegate card only to an account
 * that represents an owner or has a request to answer.
 *
 * @param bonded `useBondedDelegation` for `address`. The page owns it, because the page also shows
 *   the represented voting power in its breakdown.
 */
export function BondedDelegationCards({ address, bonded }: { address: Address; bonded: BondedDelegation }) {
  const decimals = useTokenDecimals();
  const [typed, setTyped] = useState("");

  if (!bonded.supported) return null;

  const fmt = (v?: bigint) =>
    v === undefined || decimals === undefined ? "—" : `${compactNumber(formatUnits(v, decimals))} ${PUB_TOKEN_SYMBOL}`;
  const busy = bonded.pendingAction !== undefined;
  const ownerFailure =
    bonded.failure && ["request", "cancel", "stop"].includes(bonded.failure.action)
      ? bonded.failure.message
      : undefined;
  const delegateFailure = bonded.failure && !ownerFailure ? bonded.failure.message : undefined;

  const showOwner =
    !!bonded.delegate || !!bonded.pendingDelegate || (bonded.ownWeight !== undefined && bonded.ownWeight > 0n);
  const showDelegate = bonded.owners.length > 0 || bonded.requests.length > 0;
  const { target, problem } = bondedDelegateTarget(typed, address, bonded.delegate, bonded.pendingDelegate);
  const full = bonded.maxOwners !== undefined && bonded.owners.length >= bonded.maxOwners;

  return (
    <>
      {showOwner && (
        <div className={CARD}>
          <p className="text-base font-semibold text-neutral-800">Delegate your bonded voting power</p>
          <p className="text-sm text-neutral-500">
            Your bonded voting power comes from your bonded {PUB_TOKEN_SYMBOL}
            {bonded.countsVesting ? ` and your vesting ${PUB_TOKEN_SYMBOL}` : ""}. It does not follow the delegation of
            your {bonded.countsVesting ? "locks" : `wallet ${PUB_TOKEN_SYMBOL}`}. You can give it to one address, for
            example a wallet that you vote with.
          </p>
          <p className="text-sm text-neutral-500">
            The address must accept your request before the voting power moves. You can stop the delegation at any time.
            Your {PUB_TOKEN_SYMBOL} does not move. A change counts only for proposals created after it.
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">Your bonded voting power</span>
            <span className="font-semibold text-neutral-800">{fmt(bonded.ownWeight)}</span>
          </div>

          {bonded.delegate && (
            <AccountRow
              label={
                <span className="flex items-center gap-x-2 text-sm text-neutral-500">
                  Votes through <AddressText bold={false}>{bonded.delegate}</AddressText>
                </span>
              }
            >
              <Button
                size="sm"
                variant="secondary"
                isLoading={bonded.pendingAction === "stop"}
                disabled={busy}
                onClick={() => void bonded.stop()}
              >
                Stop delegation
              </Button>
            </AccountRow>
          )}
          {bonded.pendingDelegate && (
            <AccountRow
              label={
                <span className="flex items-center gap-x-2 text-sm text-neutral-500">
                  Request sent to <AddressText bold={false}>{bonded.pendingDelegate}</AddressText>
                  <Tag label="Not accepted yet" variant="info" />
                </span>
              }
            >
              <Button
                size="sm"
                variant="secondary"
                isLoading={bonded.pendingAction === "cancel"}
                disabled={busy}
                onClick={() => void bonded.cancelRequest()}
              >
                Cancel request
              </Button>
            </AccountRow>
          )}

          <InputText placeholder="0x… delegate address" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {problem && <p className="text-sm text-critical-600">{problem}</p>}
          {target && bonded.delegate && (
            <p className="text-sm text-neutral-500">
              A new request stops your current delegation at once. The voting power then counts for you until the new
              address accepts.
            </p>
          )}
          {target && !bonded.delegate && bonded.pendingDelegate && (
            <p className="text-sm text-neutral-500">A new request replaces the request that you sent before.</p>
          )}
          {ownerFailure && <p className="text-sm text-critical-600">{ownerFailure}</p>}
          <span>
            <Button
              size="md"
              variant="primary"
              isLoading={bonded.pendingAction === "request"}
              disabled={!target || busy}
              onClick={() => {
                if (!target) return;
                // Cleared on success only: a failed request keeps the address as typed.
                void bonded.request(target).then((ok) => {
                  if (ok) setTyped("");
                });
              }}
            >
              Send request
            </Button>
          </span>
        </div>
      )}

      {showDelegate && (
        <div className={CARD}>
          <p className="text-base font-semibold text-neutral-800">Bonded voting power that you represent</p>
          <p className="text-sm text-neutral-500">
            These owners asked you to vote with their bonded voting power. You can represent
            {bonded.maxOwners === undefined ? " a limited number of" : ` at most ${bonded.maxOwners}`} owners at a time.
            An owner can stop the delegation at any time.
          </p>

          {bonded.owners.length > 0 && (
            <>
              <p className="text-sm font-semibold text-neutral-800">
                You represent {bonded.owners.length}
                {bonded.maxOwners === undefined ? "" : ` of ${bonded.maxOwners}`}
              </p>
              {bonded.owners.map((owner) => (
                <OwnerRow key={owner.address} owner={owner} fmt={fmt}>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isLoading={bonded.pendingAction === `drop:${owner.address}`}
                    disabled={busy}
                    onClick={() => void bonded.drop(owner.address)}
                  >
                    Return
                  </Button>
                </OwnerRow>
              ))}
            </>
          )}

          {bonded.requests.length > 0 && (
            <>
              <p className="text-sm font-semibold text-neutral-800">Requests</p>
              {bonded.requests.map((owner) => (
                <OwnerRow key={owner.address} owner={owner} fmt={fmt}>
                  <Button
                    size="sm"
                    variant="primary"
                    isLoading={bonded.pendingAction === `accept:${owner.address}`}
                    disabled={busy || full}
                    onClick={() => void bonded.accept(owner.address)}
                  >
                    Accept
                  </Button>
                </OwnerRow>
              ))}
              {full && (
                <p className="text-sm text-neutral-500">
                  You represent the maximum number of owners. Return the voting power of one owner before you accept a
                  request.
                </p>
              )}
            </>
          )}
          {delegateFailure && <p className="text-sm text-critical-600">{delegateFailure}</p>}
        </div>
      )}
    </>
  );
}

function AccountRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-x-4 rounded-lg border border-neutral-100 p-3">
      {label}
      {children}
    </div>
  );
}

function OwnerRow({
  owner,
  fmt,
  children,
}: {
  owner: BondedAccount;
  fmt: (v?: bigint) => string;
  children: ReactNode;
}) {
  return (
    <AccountRow
      label={
        <div className="flex min-w-0 items-center gap-x-3">
          <EnsMember address={owner.address} />
          <span className="shrink-0 text-sm font-semibold text-neutral-800">{fmt(owner.weight)}</span>
        </div>
      }
    >
      {children}
    </AccountRow>
  );
}
