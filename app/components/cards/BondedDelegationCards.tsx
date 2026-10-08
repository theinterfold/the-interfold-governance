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
 * Bonded delegation on `BondedVotes`, from both sides: a card for the account as an owner that gives
 * its bonded voting power to a delegate, and a card for the account as a delegate that represents
 * owners and answers their requests.
 *
 * Renders nothing on an adapter without bonded delegation. The owner card shows only to an account
 * with bonded voting power or a delegation to manage, and the delegate card only to an account that
 * represents an owner or has a request to answer.
 *
 * @param address The connected account.
 * @param bonded `useBondedDelegation` for `address`. The page owns it, because the page also shows
 *   the represented voting power in its breakdown.
 * @param headingPlacement Where each card's heading sits: above the card, or inside it.
 * @param blockClassName Wraps the cards in a section with this class. Only rendered when a card is.
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

  const showOwner =
    !!bonded.delegate || !!bonded.pendingDelegate || (bonded.ownWeight !== undefined && bonded.ownWeight > 0n);
  const showDelegate = bonded.owners.length > 0 || bonded.requests.length > 0;
  if (!showOwner && !showDelegate) return null;

  const compact = (v?: bigint) =>
    v === undefined || decimals === undefined ? "-" : compactNumber(formatUnits(v, decimals));
  const busy = bonded.pendingAction !== undefined;
  const ownerFailure =
    bonded.failure && ["request", "cancel", "stop"].includes(bonded.failure.action)
      ? bonded.failure.message
      : undefined;
  const delegateFailure = bonded.failure && !ownerFailure ? bonded.failure.message : undefined;
  const outside = headingPlacement === "outside";
  const { target, problem } = bondedDelegateTarget(typed, address, bonded.delegate, bonded.pendingDelegate);
  const full = bonded.maxOwners !== undefined && bonded.owners.length >= bonded.maxOwners;
  const vesting = bonded.countsVesting ? " and vesting" : "";

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
      title={`Bonded${vesting} voting power`}
      description={`Your bonded${vesting} ${PUB_TOKEN_SYMBOL} counts for you. You can give its voting power to one address, for example a wallet that you vote with.`}
    />
  );
  const delegateHeading = (
    <PanelHeader
      id="bonded-represented-heading"
      title={`Bonded${vesting} voting power you represent`}
      description={`These owners asked you to vote with their bonded${vesting} ${PUB_TOKEN_SYMBOL}. You can represent ${
        bonded.maxOwners === undefined ? "a limited number of" : `at most ${bonded.maxOwners}`
      } owners at a time.`}
    />
  );

  const cards = (
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
                    Your bonded{vesting} voting power
                    <PowerInfo label={`About bonded${vesting} voting power`} compact={true}>
                      <p>
                        It comes from your bonded {PUB_TOKEN_SYMBOL}
                        {bonded.countsVesting ? ` and your vesting ${PUB_TOKEN_SYMBOL}` : ""}. It does not follow the
                        delegation of your {bonded.countsVesting ? "locks" : `wallet ${PUB_TOKEN_SYMBOL}`}.
                      </p>
                      <p>
                        The address must accept your request before the voting power moves. Your {PUB_TOKEN_SYMBOL} does
                        not move, and a change counts only for proposals created after it.
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
                    note={`This address votes with your bonded${vesting} voting power. Stop the delegation to vote with it yourself.`}
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
                    note={`Your bonded${vesting} voting power counts for you until this address accepts the request.`}
                    action={
                      <PowerAction
                        size="compact"
                        affordance="close"
                        isLoading={bonded.pendingAction === "cancel"}
                        disabled={busy}
                        onClick={() => void bonded.cancelRequest()}
                      >
                        Withdraw request
                      </PowerAction>
                    }
                  />
                )}
                {!bonded.delegate && !bonded.pendingDelegate && (
                  <dl className="power-delegation-identity">
                    <dt>Voting delegate</dt>
                    <dd className="power-current-delegate-name">None</dd>
                    <dd className="power-current-delegate-note">Your bonded{vesting} voting power counts for you.</dd>
                  </dl>
                )}
              </div>
            </div>
            <PowerDisclosure
              title="Ask an address to vote for you"
              description="The voting power moves when the address accepts."
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
        <div className="power-delegation-block">
          {outside && delegateHeading}
          <ScrollFadeIn as="section" amount="some" className="power-card" aria-labelledby="bonded-represented-heading">
            {!outside && delegateHeading}
            <div className="power-delegation-summary">
              <div className="power-delegation-overview">
                <dl className="power-delegated-total">
                  <dt>
                    Represented voting power
                    <PowerInfo label="About represented voting power" compact={true}>
                      <p>
                        It comes from the bonded{vesting} {PUB_TOKEN_SYMBOL} of the owners that you represent. It counts
                        for you only for proposals created after you accept.
                      </p>
                      <p>The {PUB_TOKEN_SYMBOL} stays with its owners. An owner can stop the delegation at any time.</p>
                    </PowerInfo>
                  </dt>
                  <dd>
                    {compact(bonded.representedWeight)} <span>{PUB_TOKEN_SYMBOL}</span>
                  </dd>
                </dl>
              </div>
              <div className="power-delegation-content">
                <dl className="power-delegation-identity">
                  <dt>Owners</dt>
                  <dd className="power-current-delegate-name">
                    {bonded.owners.length}
                    {bonded.maxOwners === undefined ? "" : ` of ${bonded.maxOwners}`}
                  </dd>
                  <dd className="power-current-delegate-note">
                    {full
                      ? "You represent the maximum number of owners. Return the voting power of one owner before you accept another request."
                      : "You and each owner can end the delegation at any time."}
                  </dd>
                </dl>
              </div>
            </div>
            {bonded.owners.length > 0 && (
              <OwnerList
                label="Owners you represent"
                owners={bonded.owners}
                countsVesting={bonded.countsVesting}
                compact={compact}
                action={(owner) => (
                  <PowerAction
                    size="compact"
                    affordance="undo"
                    aria-label={`Return the voting power of ${owner.address}`}
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
              <OwnerList
                label="Requests"
                heading="Requests"
                owners={bonded.requests}
                countsVesting={bonded.countsVesting}
                compact={compact}
                action={(owner) => (
                  <PowerAction
                    size="compact"
                    affordance="check"
                    aria-label={`Accept the request of ${owner.address}`}
                    isLoading={bonded.pendingAction === `accept:${owner.address}`}
                    disabled={busy || full}
                    onClick={() => void bonded.accept(owner.address)}
                  >
                    Accept
                  </PowerAction>
                )}
              />
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
    <section className={blockClassName} aria-label={`Bonded${vesting} voting power`}>
      {cards}
    </section>
  ) : (
    cards
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

/**
 * Owners in wallet rows under the delegation summary: the voting power that each one moves, its
 * bonded and vesting parts, and one action per owner.
 */
function OwnerList({
  label,
  heading,
  owners,
  countsVesting,
  compact,
  action,
}: {
  label: string;
  heading?: string;
  owners: BondedAccount[];
  countsVesting: boolean;
  compact: (v?: bigint) => string;
  action: (owner: BondedAccount) => ReactNode;
}) {
  return (
    <section className="power-delegate-list" aria-label={label}>
      {heading && <h3 className="power-delegate-head ui-table-head">{heading}</h3>}
      {owners.map((owner) => (
        <WalletListRow key={owner.address} layout="table" identity={<EnsMember address={owner.address} />}>
          <div className="power-delegate-votes">
            <ListTokenAmount value={compact(owner.weight)} symbol={PUB_TOKEN_SYMBOL} />
            {countsVesting && (
              <span className="ui-label">
                Bonded {compact(owner.bonded)} {PUB_TOKEN_SYMBOL} · Vesting {compact(owner.vesting)} {PUB_TOKEN_SYMBOL}
              </span>
            )}
          </div>
          {action(owner)}
        </WalletListRow>
      ))}
    </section>
  );
}
