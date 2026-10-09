import { AddressText } from "./address";

/** Compact metadata; the shared wallet surface exposes the full address and copy action. */
export function AddressLine({ address }: { address?: string }) {
  return (
    <span className="delegate-address address-line">
      <AddressText bold={false} label={address ? `${address.slice(0, 10)}…${address.slice(-8)}` : undefined}>
        {address}
      </AddressText>
    </span>
  );
}
