import { useState, type FormEvent, type ReactNode } from "react";
import { formatUnits, type Address } from "viem";
import { FieldError } from "@/components/input/fieldError";
import { SearchField } from "@/components/input/searchField";
import { PanelHeader } from "@/components/panelHeader";
import { AddressText } from "@/components/text/address";
import { EnsMember } from "@/components/text/ensMember";
import { ListTokenAmount } from "@/components/text/listValue";
import { StatusBadge } from "@/components/text/statusBadge";
import { WalletListRow } from "@/components/walletListRow";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import type { BondedAccount, BondedDelegation } from "@/hooks/useBondedDelegation";
import { useMemberName } from "@/hooks/useMemberName";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { PowerDisclosure } from "@/plugins/velocker/components/powerDisclosure";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import panelStyles from "@/plugins/velocker/components/accountPanels.module.css";
import { bondedDelegateTarget } from "@/utils/bondedDelegation";
import { compactNumber } from "@/utils/numbers";
import { ScrollFadeIn } from "@/vendor/site-header/motion";

/**
 * Bonded delegation on `BondedVotes`, from both sides: a panel for the account as an owner that
 * gives its bonded voting power to a delegate, and a panel for the account as a delegate that
 * represents owners and answers their requests.
 *
 * Renders nothing on an adapter without bonded delegation. The owner panel shows only to an account
 * with bonded voting power or a delegation to manage, and the delegate panel only to an account
 * that represents an owner or has a request to answer.
 *
 * @param bonded `useBondedDelegation` for `address`. The page owns it, because the page also shows
 *   the represented voting power in its breakdown.
 * @param headingPlacement Where each panel's heading sits: above its card, or inside it.
 * @param blockClassName Wraps the panels in a section with this class. Only rendered when a panel is.
 */
export function BondedDelegationCards({
  address,
  bonded,
  headingPlacement = "outside",
  blockClassName,
}: {
  address: Address;
  bonded: BondedDelegation;
  headingPlacement?: "inside" | "outside";
  blockClassName?: string;
}) {
  const decimals = useTokenDecimals();
  const [typed, setTyped] = useState("");

  if (!bonded.supported) return null;

  const compact = (v?: bigint) =>
    v === undefined || decimals === undefined ? "—" : compactNumber(formatUnits(v, decimals));
  const busy = bonded.pendingAction !== undefined;
  const ownerFailure =
    bonded.failure && ["request", "cancel", "stop"].includes(bonded.failure.action)
      ? bonded.failure.message
      : undefined;
  const delegateFailure = bonded.failure && !ownerFailure ? bonded.failure.message : undefined;

  const showOwner =
    !!bonded.delegate || !!bonded.pendingDelegate || (bonded.ownWeight !== undefined && bonded.ownWeight > 0n);
  const showDelegate = bonded.owners.length > 0 || bonded.requests.length > 0;
  if (!showOwner && !showDelegate) return null;

  const outside = headingPlacement === "outside";
  const { target, problem } = bondedDelegateTarget(typed, address, bonded.delegate, bonded.pendingDelegate);
  const full = bonded.maxOwners !== undefined && bonded.owners.length >= bonded.maxOwners;

  const submitRequest = (event: FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    // Cleared on success only: a failed request keeps the address as typed.
    void bonded.request(target).then((ok) => {
      if (ok) setTyped("");
    });
  };

  const ownerHeading = (
    <PanelHeader
      id="bonded-owner-heading"
      title="Bonded voting power"
      description={`Give the voting power of your bonded${bonded.countsVesting ? " and vesting" : ""} ${PUB_TOKEN_SYMBOL} to one address, for example a wallet that you vote with.`}
    />
  );
  const delegateHeading = (
    <PanelHeader
      id="bonded-represented-heading"
      title="Bonded voting power you represent"
      description={`These owners asked you to vote with their bonded voting power. You can represent${
        bonded.maxOwners === undefined ? " a limited number of" : ` at most ${bonded.maxOwners}`
      } owners at a time. An owner can stop the delegation at any time.`}
    />
  );

  const panels = (
    <div className={panelStyles.panels}>
      {showOwner && (
        <div className="power-delegation-block">
          {outside && ownerHeading}
          <ScrollFadeIn as="section" amount="some" className="power-card" aria-labelledby="bonded-owner-heading">
            {!outside && ownerHeading}
            <div className="power-delegation-summary">
              <div className="power-delegation-overview">
                <dl className="power-delegated-total">
                  <dt>
                    Your bonded voting power
                    <PowerInfo label="About bonded voting power" compact={true}>
                      <p>
                        It comes from your bonded {PUB_TOKEN_SYMBOL}
                        {bonded.countsVesting ? ` and your vesting ${PUB_TOKEN_SYMBOL}` : ""}. It does not follow the
                        delegation of your {bonded.countsVesting ? "locks" : `wallet ${PUB_TOKEN_SYMBOL}`}.
                      </p>
                      <p>
                        The address must accept your request before the voting power moves. Your {PUB_TOKEN_SYMBOL}{" "}
                        does not move, and a change counts only for proposals created after it.
                      </p>
                    </PowerInfo>
                  </dt>
                  <dd>
                    {compact(bonded.ownWeight)} <span>{PUB_TOKEN_SYMBOL}</span>
                  </dd>
                </dl>
              </div>
              <div className="power-delegation-content">
                {bonded.delegate && (
                  <BondedParty
                    label="Votes through"
                    address={bonded.delegate}
                    note="This address votes with your bonded voting power. You can stop the delegation at any time."
                    action={
                      <PowerAction
                        size="compact"
                        affordance="close"
                        isLoading={bonded.pendingAction === "stop"}
                        disabled={busy}
                        onClick={() => void bonded.stop()}
                      >
                        Stop delegation
                      </PowerAction>
                    }
                  />
                )}
                {bonded.pendingDelegate && (
                  <BondedParty
                    label="Request sent to"
                    address={bonded.pendingDelegate}
                    status={<StatusBadge className="pending">Not accepted yet</StatusBadge>}
                    note="The voting power moves when this address accepts the request."
                    action={
                      <PowerAction
                        size="compact"
                        affordance="close"
                        isLoading={bonded.pendingAction === "cancel"}
                        disabled={busy}
                        onClick={() => void bonded.cancelRequest()}
                      >
                        Cancel request
                      </PowerAction>
                    }
                  />
                )}
                {!bonded.delegate && !bonded.pendingDelegate && (
                  <dl className="power-delegation-identity">
                    <dt>Voting delegate</dt>
                    <dd className="power-current-delegate-name">None</dd>
                    <dd className="power-current-delegate-note">
                      Your bonded voting power counts for you. You can give it to one address at any time.
                    </dd>
                  </dl>
                )}
              </div>
            </div>
            <PowerDisclosure
              title="Ask an address to represent you"
              description="The address must accept before the voting power moves."
              defaultOpen={!bonded.delegate && !bonded.pendingDelegate}
            >
              <form className="power-delegation-content" onSubmit={submitRequest}>
                <SearchField
                  label="Delegate address"
                  placeholder="0x… wallet address"
                  value={typed}
                  onChange={setTyped}
                  message={
                    target && bonded.delegate
                      ? "A new request stops your current delegation at once. The voting power then counts for you until the new address accepts."
                      : target && bonded.pendingDelegate
                        ? "A new request replaces the request that you sent before."
                        : undefined
                  }
                />
                <FieldError id="bonded-delegate-problem" message={problem} />
                {ownerFailure && (
                  <p className="power-feedback" role="alert">
                    {ownerFailure}
                  </p>
                )}
                <PowerAction
                  type="submit"
                  intent="confirm"
                  affordance="send"
                  isLoading={bonded.pendingAction === "request"}
                  disabled={!target || busy}
                >
                  Send request
                </PowerAction>
              </form>
            </PowerDisclosure>
          </ScrollFadeIn>
        </div>
      )}

      {showDelegate && (
        <div>
          {outside && delegateHeading}
          <ScrollFadeIn
            as="section"
            amount="some"
            className="power-card"
            aria-labelledby="bonded-represented-heading"
          >
            {!outside && delegateHeading}
            {bonded.owners.length > 0 && (
              <OwnerGroup
                title={`You represent ${bonded.owners.length}${bonded.maxOwners === undefined ? "" : ` of ${bonded.maxOwners}`}`}
                owners={bonded.owners}
                compact={compact}
                action={(owner) => (
                  <PowerAction
                    size="compact"
                    affordance="undo"
                    isLoading={bonded.pendingAction === `drop:${owner.address}`}
                    disabled={busy}
                    onClick={() => void bonded.drop(owner.address)}
                  >
                    Return
                  </PowerAction>
                )}
              />
            )}
            {bonded.requests.length > 0 && (
              <OwnerGroup
                title="Requests"
                owners={bonded.requests}
                compact={compact}
                action={(owner) => (
                  <PowerAction
                    size="compact"
                    affordance="check"
                    isLoading={bonded.pendingAction === `accept:${owner.address}`}
                    disabled={busy || full}
                    onClick={() => void bonded.accept(owner.address)}
                  >
                    Accept
                  </PowerAction>
                )}
              >
                {full && (
                  <p className="power-help py-3">
                    You represent the maximum number of owners. Return the voting power of one owner before you accept
                    a request.
                  </p>
                )}
              </OwnerGroup>
            )}
            {delegateFailure && (
              <p className="power-feedback" role="alert">
                {delegateFailure}
              </p>
            )}
          </ScrollFadeIn>
        </div>
      )}
    </div>
  );

  return blockClassName ? (
    <section className={blockClassName} aria-label="Bonded voting power">
      {panels}
    </section>
  ) : (
    panels
  );
}

/** One delegate of the account's bonded voting power, with the control that ends the relationship. */
function BondedParty({
  label,
  address,
  status,
  note,
  action,
}: {
  label: string;
  address: Address;
  status?: ReactNode;
  note: string;
  action: ReactNode;
}) {
  const name = useMemberName(address);
  return (
    <>
      <dl className="power-delegation-identity">
        <dt>{label}</dt>
        <dd className="power-current-delegate-name">
          <AddressText bold={false} label={name} withAddress={true}>
            {address}
          </AddressText>
          {status}
        </dd>
        <dd className="power-current-delegate-note">{note}</dd>
      </dl>
      <div className="power-current-delegate-actions" role="group" aria-label={label}>
        {action}
      </div>
    </>
  );
}

/** A list of owners with the bonded voting power each one moves, and one action per owner. */
function OwnerGroup({
  title,
  owners,
  compact,
  action,
  children,
}: {
  title: string;
  owners: BondedAccount[];
  compact: (v?: bigint) => string;
  action: (owner: BondedAccount) => ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="delegate-directory" aria-label={title}>
      <div className="power-delegate-head ui-table-head">
        <h3 className="power-delegate-identity-heading">{title}</h3>
        <div className="power-delegate-data">
          <span className="power-delegate-power-heading ui-number">Voting power</span>
        </div>
      </div>
      <div className="power-delegate-list">
        {owners.map((owner) => (
          <WalletListRow key={owner.address} layout="table" identity={<EnsMember address={owner.address} />}>
            <div className="power-delegate-votes ui-number">
              <div className="text-sm font-semibold text-neutral-800">
                <ListTokenAmount value={compact(owner.weight)} symbol={PUB_TOKEN_SYMBOL} />
              </div>
            </div>
            {action(owner)}
          </WalletListRow>
        ))}
      </div>
      {children}
    </section>
  );
}
