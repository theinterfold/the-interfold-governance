import { type RawAction } from "@/utils/types";
import { type FC, useEffect, useState } from "react";
import { InputText, InputNumber, AlertInline } from "@aragon/ods";
import { type Address } from "viem";
import { isAddress } from "@/utils/evm";
import { ElseIf, If, Then } from "../if";
import { parseActionValue } from "@/utils/action-value";
import { PUB_CHAIN } from "@/constants";

interface IWithdrawalFormProps {
  onChange: (action: RawAction | null) => any;
  onSubmit?: () => any;
}

export const WithdrawalForm: FC<IWithdrawalFormProps> = ({ onChange, onSubmit }) => {
  const coinName = PUB_CHAIN.nativeCurrency.symbol;
  const [to, setTo] = useState<Address>();
  const [value, setValue] = useState<bigint | null>(null);

  useEffect(() => {
    if (!to || !isAddress(to) || value === null) {
      onChange(null);
      return;
    }
    onChange({ to, value, data: "0x" });
  }, [to, value]);

  const handleTo = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTo(event?.target?.value as Address);
  };

  return (
    <div className="my-6">
      <div className="mb-3 pb-3">
        <InputText
          label="Recipient address"
          placeholder="0x1234..."
          variant={!to || isAddress(to) ? "default" : "critical"}
          value={to}
          onChange={handleTo}
        />
        <If not={to}>
          <Then>
            <p className="mt-3">Enter the address to transfer {coinName} to</p>
          </Then>
          <ElseIf not={isAddress(to)}>
            <AlertInline className="mt-3" message="The address of the contract is not valid" variant="critical" />
          </ElseIf>
        </If>
      </div>
      <div>
        <InputNumber
          label={`${coinName} amount`}
          placeholder="1.234"
          min={0}
          onChange={(val: string) => setValue(parseActionValue(val))}
          onKeyDown={(e) => (e.key === "Enter" ? onSubmit?.() : null)}
        />
      </div>
    </div>
  );
};
