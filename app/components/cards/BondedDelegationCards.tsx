import { RecordTable, useRecordTable } from "@/components/recordTable";
import { DelegationRecordStatus } from "@/components/recordStatus";
import { StatusGroupHeading } from "@/components/statusGroupHeading";
import { Check, Hourglass } from "@phosphor-icons/react";
import { BendingChevron } from "@/vendor/site-header";
import styles from "./bondedDelegationCards.module.css";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { formatUnits, type Address } from "viem";
import { FieldError } from "@/components/input/fieldError";
import { SearchField } from "@/components/input/searchField";
import { PanelHeader } from "@/components/panelHeader";
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
import { bondedDelegateTarget, bondedOwnerView } from "@/utils/bondedDelegation";
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
  section = "all",
  showOwnerAmount = true,
  ownerSummary,
  delegateLabel,
  groupRepresentation = true,
  animateOwnerEntrance = true,
}: {
  address: Address;
  bonded: BondedDelegation;
  headingPlacement?: "inside" | "outside" | "none";
  section?: "all" | "owner" | "representation" | "represented" | "requests";
  showOwnerAmount?: boolean;
  ownerSummary?: ReactNode;
  delegateLabel?: string;
  groupRepresentation?: boolean;
  /** An enclosing card can own the entrance of the complete panel. */
  animateOwnerEntrance?: boolean;
  blockClassName?: string;
}) {
  const { presentation: recordLayout } = useRecordTable();
  const GroupPanel = recordLayout ? "section" : ScrollFadeIn;
  const delegateErrorId = useId();
  const decimals = useTokenDecimals();
  const [typed, setTyped] = useState("");

  if (!bonded.supported) return null;

  const emptyRepresentation = groupRepresentation && section === "all" && bonded.ownersState === "success" && bonded.requestsState === "success" && !bonded.owners.length && !bonded.requests.length;
  const ownerView = bondedOwnerView(bonded);
  const showOwner = ownerView !== "hidden" && (section === "all" || section === "owner");
  const showDelegate = section !== "owner" && (groupRepresentation || bonded.owners.length > 0 || bonded.requests.length > 0);
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
  const ownerVesting = bonded.ownVesting === 0n ? "" : vesting;
  const representationCapacity = bonded.maxOwners !== undefined ? (
    <span className={styles.capacitySummary}>
      {bonded.owners.length === 0 && bonded.representedWeight === undefined ? "—" : bonded.owners.length} of {bonded.maxOwners} represented
    </span>
  ) : undefined;

  const submitRequest = (event: FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    // Cleared on success only: a failed request keeps the address as typed.
    void bonded.request(target).then((ok) => {
      if (ok) setTyped("");
    });
  };

  const ownerHeading = <PanelHeader id="bonded-owner-heading"
    title={`Bonded${ownerVesting} voting power`}
    description={`Choose who votes with your bonded${ownerVesting} ${PUB_TOKEN_SYMBOL}.`} />;
  const delegateHeading = (
    <PanelHeader
      id="bonded-represented-heading"
      title="Wallets you represent"
      count={bonded.owners.length}
      action={representationCapacity}
      description={`Bonded${vesting} voting power delegated to you. Tokens stay with their owners.`}
    />
  );

  const representedSummary = <>
              <span className={styles.summaryLabel}>Total represented
                <PowerInfo label="About represented voting power" compact={true}>
                  <p>This is the bonded{vesting} {PUB_TOKEN_SYMBOL} of the wallets you represent. It counts for proposals created after you accept.</p>
                  <p>Tokens stay with their owners. Either wallet can end the delegation.</p>
                  {bonded.maxOwners !== undefined && <p>You can represent up to {bonded.maxOwners} wallets at a time for bonded{vesting} voting power.</p>}
                </PowerInfo>
              </span>
              <ListTokenAmount value={compact(bonded.representedWeight)} symbol={PUB_TOKEN_SYMBOL} />
  </>;

  const OwnerPanel = animateOwnerEntrance ? ScrollFadeIn : "section";
  const cards = (
    <div className={panelStyles.panels}>
      {showOwner && (
        <div className="power-delegation-block">
          {outside && ownerHeading}
          <OwnerPanel {...(animateOwnerEntrance ? { as: "section" as const, amount: "some" as const } : {})} className="power-card bonded-owner-card" aria-labelledby={headingPlacement === "none" ? undefined : "bonded-owner-heading"} aria-label={headingPlacement === "none" ? "Bonded and vesting delegation" : undefined}>
            {!outside && headingPlacement !== "none" && ownerHeading}
            {ownerView === "delegate" && <PowerDisclosure
              className={panelStyles.inlineDelegation}
              title="Delegate voting power"
              renderHeading={(toggle) => <div className={panelStyles.delegationSummary} data-amount={showOwnerAmount && !ownerSummary} data-custom-summary={!!ownerSummary}>

              {ownerSummary ?? <>
              {showOwnerAmount && <div className={panelStyles.delegationAmount}>
                <span className={panelStyles.delegationLabel}>Combined voting power
                  <PowerInfo label={`About bonded${vesting} voting power`} compact={true}>
                    <p>It comes from your bonded {PUB_TOKEN_SYMBOL}{bonded.countsVesting ? ` and your vesting ${PUB_TOKEN_SYMBOL}` : ""}. It is separate from the delegation of your {bonded.countsVesting ? "locks" : `wallet ${PUB_TOKEN_SYMBOL}`}.</p>
                    <p>A wallet must accept your request before it can vote for you. Your tokens stay with you. Changes apply only to proposals created afterwards.</p>
                  </PowerInfo>
                </span>
                <ListTokenAmount value={compact(bonded.ownWeight)} symbol={PUB_TOKEN_SYMBOL} />
                <div className={styles.ownerBreakdown} aria-label="Composition of this voting power">
                  <span><strong>{compact(bonded.ownBonded)} FOLD</strong> bonded</span>
                  {bonded.countsVesting && bonded.ownVesting !== 0n && <>
                    <span aria-hidden="true">+</span>
                    <span><strong>{compact(bonded.ownVesting)} FOLD</strong> vesting</span>
                  </>}
                </div>
              </div>}
              <span className={panelStyles.delegationState} data-active={!bonded.delegate}>
                {!bonded.delegate ? <><Check size={16} weight="regular" aria-hidden="true" /> You vote with this power</> : "Delegated to another wallet"}
              </span>
              </>}
              {toggle}
            </div>}
              renderToggle={({ open, controls, onToggle }) => <PowerAction
                size="compact" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
                {open ? "Close" : bonded.delegate || bonded.pendingDelegate ? "Change wallet" : delegateLabel ?? "Delegate to another wallet"}
                <BendingChevron open={open} className="power-disclosure-chevron" />
              </PowerAction>}
            >
              <form className={styles.requestForm} onSubmit={submitRequest}>
                <p className={panelStyles.delegationNote}>Delegate all your bonded{ownerVesting} voting power to one wallet. Active locks are not included. {bonded.delegate ? "Sending a new request ends your current delegation immediately. You then vote with this power until the new wallet accepts." : "You keep voting until the wallet accepts."} Your tokens stay yours.</p>
                <div className={styles.requestFields}>
                <SearchField
                  label="Delegate address"
                  kind="address"
                  invalid={!!problem}
                  describedBy={problem ? delegateErrorId : undefined}
                  placeholder="0x… wallet address"
                  value={typed}
                  onChange={setTyped}
                />
                <PowerAction
                  type="submit"
                  intent="confirm"
                  affordance="send"
                  isLoading={bonded.pendingAction === "request"}
                  disabled={!target || busy}
                >
                  Send request
                </PowerAction>
                </div>
                <FieldError id={delegateErrorId} message={problem} role="alert" />
                {target && bonded.pendingDelegate && !bonded.delegate && <p className="power-help" role="status">A new request replaces the request that you sent before.</p>}
              </form>
            </PowerDisclosure>}
            {(bonded.delegate || bonded.pendingDelegate) && <div className={styles.ownerParty} data-management-only={ownerView === "manage" || undefined}>
                {bonded.delegate && (
                  <BondedParty
                    label="Votes through"
                    address={bonded.delegate}
                    note="Stop delegating to vote with this power yourself."
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
                    status={<PowerInfo compact label="Delegation request not accepted yet" trigger={
                      <StatusBadge className="pending" responsive={{label:"Not accepted yet",short:"Pending",icon:<Hourglass size={16} aria-hidden="true" />}}>Not accepted yet</StatusBadge>
                    }><p>You keep voting with this power until the request is accepted.</p></PowerInfo>}
                    note="You keep voting with this power until the request is accepted."
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
            </div>}
            {ownerFailure && <p className="power-feedback" role="alert">{ownerFailure}</p>}
          </OwnerPanel>
        </div>
      )}

      {showDelegate && (
        <section className="power-delegation-block" aria-labelledby={groupRepresentation ? "delegations-heading" : undefined}>
          <RecordTable kind="delegations" enabled={recordLayout} showColumns={bonded.owners.length > 0 || bonded.requests.length > 0} heading={groupRepresentation ? <PanelHeader animate={!recordLayout} id="delegations-heading" title="Delegations" description="Wallets you represent and requests awaiting your acceptance." action={emptyRepresentation ? undefined : representationCapacity} /> : undefined}>
          {emptyRepresentation && <div data-record-group className="power-card"><p className={styles.emptyGroup}>No delegations yet. Requests from other wallets will appear here for you to accept.</p></div>}
          {!emptyRepresentation && section !== "requests" && (bonded.owners.length > 0 || groupRepresentation) && <>
          {!groupRepresentation && outside && delegateHeading}
          <GroupPanel {...(GroupPanel === ScrollFadeIn ? {as:"section" as const, amount:"some" as const} : {})} data-record-group className={`power-card ${groupRepresentation ? styles.groupCard : headingPlacement !== "inside" && bonded.owners.length === 1 ? styles.rowsOnly : ""}`} aria-labelledby={recordLayout || headingPlacement === "none" ? undefined : "bonded-represented-heading"} aria-label={recordLayout || headingPlacement === "none" ? "Wallets you represent" : undefined}>
            {groupRepresentation && !recordLayout && <StatusGroupHeading id="bonded-represented-heading" title="Accepted" tone="positive" icon={<Check size={20} aria-hidden="true"/>} count={bonded.owners.length} description="Included in your voting power" trailing={bonded.owners.length > 1 ? <div className={styles.headingTotal}>{representedSummary}</div> : undefined} />}
            {!groupRepresentation && !outside && headingPlacement !== "none" && delegateHeading}
            {groupRepresentation && <DelegationListFeedback group="owners" bonded={bonded} />}
            {!groupRepresentation && bonded.owners.length > 1 && <div className={styles.summary}>{representedSummary}</div>}
            {bonded.owners.length > 0 && (
              <OwnerList
                label="Currently represented"
                state="active"
                showStatus={!groupRepresentation}
                owners={bonded.owners}
                countsVesting={bonded.countsVesting}
                compact={compact}
                action={(owner, name) => (
                  <PowerAction
                    size="compact"
                    affordance="undo"
                    aria-label={`Return the voting power of ${name}`}
                    isLoading={bonded.pendingAction === `drop:${owner.address}`}
                    disabled={busy}
                    onClick={() => void bonded.drop(owner.address)}
                  >
                    Return
                  </PowerAction>
                )}
              />
            )}

            {delegateFailure && !bonded.failure?.action.startsWith("accept:") && (
              <p className="power-feedback" role="alert">
                {delegateFailure}
              </p>
            )}
          </GroupPanel>
          </>}
            {!emptyRepresentation && section !== "represented" && (bonded.requests.length > 0 || groupRepresentation) && (
              <div data-record-following className={groupRepresentation ? styles.groupRequests : section !== "requests" && bonded.owners.length > 0 ? styles.requests : undefined}>
                {!groupRepresentation && <PanelHeader id="bonded-requests-heading" title="Delegation requests" count={bonded.requests.length}
                  action={representationCapacity}
                  description="Accept a request to represent that wallet. Its voting power counts only after acceptance." />}
                <GroupPanel {...(GroupPanel === ScrollFadeIn ? {as:"section" as const, amount:"some" as const} : {})} data-record-group className={`power-card ${groupRepresentation ? styles.groupCard : styles.rowsOnly}`} aria-labelledby={recordLayout ? undefined : "bonded-requests-heading"} aria-label={recordLayout ? "Delegation requests" : undefined}>
                  {groupRepresentation && !recordLayout && <StatusGroupHeading id="bonded-requests-heading" title="Pending requests" icon={<Hourglass size={20} aria-hidden="true"/>} count={bonded.requests.length} description="Not counted until you accept" />}
                  {groupRepresentation && <DelegationListFeedback group="requests" bonded={bonded} />}
                  {full && bonded.requests.length > 0 && <p className={styles.capacity}>All slots are filled. Return voting power to an owner before accepting another request.</p>}
              <OwnerList
                label="Delegation requests"
                state="pending"
                showStatus={!groupRepresentation}
                owners={bonded.requests}
                countsVesting={bonded.countsVesting}
                compact={compact}
                action={(owner, name) => (
                  <PowerAction
                    size="compact"
                    intent="confirm"
                    affordance="check"
                    aria-label={`Accept the request of ${name}`}
                    isLoading={bonded.pendingAction === `accept:${owner.address}`}
                    disabled={busy || full || bonded.ownersState !== "success"}
                    onClick={() => void bonded.accept(owner.address)}
                  >
                    Accept
                  </PowerAction>
                )}
              />
                  {delegateFailure && bonded.failure?.action.startsWith("accept:") && <p className="power-feedback" role="alert">{delegateFailure}</p>}
                </GroupPanel>
              </div>
            )}
          </RecordTable>
        </section>
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

function DelegationListFeedback({ group, bonded }: { group: "owners" | "requests"; bonded: BondedDelegation }) {
  const owners = group === "owners";
  const label = owners ? "accepted delegations" : "pending requests";
  const state = owners ? bonded.ownersState : bonded.requestsState;
  if (state === "error") {
    return <p className={styles.emptyGroup} role="alert">
      Could not load {label}.{" "}
      <button type="button" className="ui-text-action" onClick={owners ? bonded.retryOwners : bonded.retryRequests}>Try again</button>
    </p>;
  }
  if (state === "pending") return <p className={styles.emptyGroup} role="status">Loading {label}…</p>;
  if (bonded[group].length) return null;
  return <p className={styles.emptyGroup}>{owners ? "No accepted delegations yet." : "No pending requests."}</p>;
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
  return (
    <>
      <dl className="power-delegation-identity">
        <dt>{label}</dt>
        <dd className="power-current-delegate-name">
          <EnsMember address={address} />
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
  label, state, owners, countsVesting, compact, action, showStatus = true,
}: {
  label: string;
  state: "active" | "pending";
  showStatus?: boolean;
  owners: BondedAccount[];
  countsVesting: boolean;
  compact: (v?: bigint) => string;
  action: (owner: BondedAccount, name: string) => ReactNode;
}) {
  return (
    <section className={`power-delegate-list ${styles.list}`} aria-label={label}>
      {owners.map(owner => <OwnerRow key={owner.address} owner={owner} state={state} showStatus={showStatus} countsVesting={countsVesting} compact={compact} action={action} />)}
    </section>
  );
}

function OwnerRow({ owner, state, countsVesting, compact, action, showStatus = true }: {
  owner: BondedAccount;
  state: "active" | "pending";
  showStatus?: boolean;
  countsVesting: boolean;
  compact: (v?: bigint) => string;
  action: (owner: BondedAccount, name: string) => ReactNode;
}) {
  const { presentation: recordLayout } = useRecordTable();
  const name = useMemberName(owner.address);
  return (
    <WalletListRow layout="table" status={recordLayout ? <DelegationRecordStatus state={state} /> : undefined} identity={
      <div className={styles.identity}>
        <EnsMember address={owner.address} />
        {!recordLayout && showStatus && <span className={styles.status} data-state={state}>
          <span aria-hidden="true">{state === "active" ? "✓" : "○"}</span>
          {state === "active" ? "Representing" : "Awaiting acceptance"}
        </span>}
      </div>
    }>
      <div className="power-delegate-votes">
        <ListTokenAmount value={compact(owner.weight)} symbol={PUB_TOKEN_SYMBOL} />
        {countsVesting && <div className={styles.breakdown}>
          <span>{compact(owner.bonded)} bonded</span><span aria-hidden="true">·</span><span>{compact(owner.vesting)} vesting</span>
        </div>}
      </div>
      {action(owner, name ?? owner.address)}
    </WalletListRow>
  );
}
