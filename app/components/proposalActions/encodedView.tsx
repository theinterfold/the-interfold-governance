import { PUB_CHAIN } from "@/constants";
import { AddressText } from "@/components/text/address";
import { type RawAction } from "@/utils/types";
import { ActionDetailField } from "./actionDetailField";
import { formatEther } from "viem";

export function EncodedView({ rawAction }: { rawAction: RawAction }) {
  return (
    <>
      <ActionDetailField label="To">
        <AddressText bold={false} label={rawAction.to}>
          {rawAction.to}
        </AddressText>
      </ActionDetailField>
      {rawAction.data && rawAction.data !== "0x" && (
        <ActionDetailField label="Data" code={true}>
          {rawAction.data}
        </ActionDetailField>
      )}
      <ActionDetailField label="Value">
        {formatEther(rawAction.value ?? 0n)} {PUB_CHAIN.nativeCurrency.symbol}
      </ActionDetailField>
    </>
  );
}
