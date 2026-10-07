import type { ReactNode } from "react";
import { formatUnits, type Address } from "viem";
import { PanelHeader } from "@/components/panelHeader";
import { AddressText } from "@/components/text/address";
import { StatusBadge } from "@/components/text/statusBadge";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import type { BondedDelegation } from "@/hooks/useBondedDelegation";
import { useMemberName } from "@/hooks/useMemberName";
import { useTokenDecimals } from "@/hooks/useTokenDecimals";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import panelStyles from "@/plugins/velocker/components/accountPanels.module.css";
import { compactNumber } from "@/utils/numbers";
import { ScrollFadeIn } from "@/vendor/site-header/motion";

/**
 * The bonded voting power of the account on `BondedVotes`. It counts for the account while no other
 * address represents it. An account that handed it to another address earlier sees that address and
 * takes the voting power back, or withdraws a request that the address has not accepted.
 *
 * Renders nothing on an adapter without bonded delegation. The panel shows only to an account with
 * bonded voting power, a delegate or a pending request.
 *
 * @param bonded `useBondedDelegation` for the connected account. The page owns it, because the page
 *   also shows the represented voting power in its breakdown.
 * @param headingPlacement Where the heading sits: above its card, or inside it.
 * @param blockClassName Wraps the panel in a section with this class. Only rendered when the panel is.
 */
export function BondedDelegationCards({
  bonded,
  headingPlacement = "outside",
  blockClassName,
}: {
  bonded: BondedDelegation;
  headingPlacement?: "inside" | "outside";
  blockClassName?: string;
}) {
  const decimals = useTokenDecimals();

  if (!bonded.supported) return null;

  const show =
    !!bonded.delegate || !!bonded.pendingDelegate || (bonded.ownWeight !== undefined && bonded.ownWeight > 0n);
  if (!show) return null;

  const ownWeight =
    bonded.ownWeight === undefined || decimals === undefined
      ? "—"
      : compactNumber(formatUnits(bonded.ownWeight, decimals));
  const busy = bonded.pendingAction !== undefined;
  const outside = headingPlacement === "outside";

  const heading = (
    <PanelHeader
      id="bonded-owner-heading"
      title="Bonded voting power"
      description={`Your bonded${bonded.countsVesting ? " and vesting" : ""} ${PUB_TOKEN_SYMBOL} counts for you while no other address votes for you.`}
    />
  );

  const panel = (
    <div className={panelStyles.panels}>
      <div className="power-delegation-block">
        {outside && heading}
        <ScrollFadeIn as="section" amount="some" className="power-card" aria-labelledby="bonded-owner-heading">
          {!outside && heading}
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
                      Your {PUB_TOKEN_SYMBOL} does not move, and a change counts only for proposals created after it.
                    </p>
                  </PowerInfo>
                </dt>
                <dd>
                  {ownWeight} <span>{PUB_TOKEN_SYMBOL}</span>
                </dd>
              </dl>
            </div>
            <div className="power-delegation-content">
              {bonded.delegate && (
                <BondedParty
                  label="Votes through"
                  address={bonded.delegate}
                  note="This address votes with your bonded voting power. Stop the delegation to vote with it yourself."
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
                  note="Your bonded voting power still counts for you. Withdraw the request to keep it that way."
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
                  <dd className="power-current-delegate-note">Your bonded voting power counts for you.</dd>
                </dl>
              )}
              {bonded.failure && (
                <p className="power-feedback" role="alert">
                  {bonded.failure.message}
                </p>
              )}
            </div>
          </div>
        </ScrollFadeIn>
      </div>
    </div>
  );

  return blockClassName ? (
    <section className={blockClassName} aria-label="Bonded voting power">
      {panel}
    </section>
  ) : (
    panel
  );
}

/** The address that holds or has been asked for the account's bonded voting power, with the control that takes it back. */
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
