import { AddressText } from "@/components/text/address";

export function BallotWalletSummary({
  voter,
  sender,
  submitted = false,
}: {
  voter: string;
  sender?: string;
  submitted?: boolean;
}) {
  return (
    <dl className="ballot-wallet-summary">
      <div>
        <dt>Vote counts for</dt>
        <dd>
          <AddressText bold={false}>{voter}</AddressText>
        </dd>
      </div>
      {(sender || !submitted) && (
        <div>
          <dt>{submitted ? "Sent by" : "Sending wallet"}</dt>
          <dd>{sender ? <AddressText bold={false}>{sender}</AddressText> : "Not connected"}</dd>
        </div>
      )}
    </dl>
  );
}
