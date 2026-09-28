import { decodeCamelCase } from "@/utils/case";
import { ActionDetailField } from "./actionDetailField";
import { toFunctionSignature, type AbiFunction } from "viem";
import { resolveFieldTitle, resolveParamValue, type CallParameterFieldType } from "@/utils/abi-helpers";

interface ICallParamFiledProps {
  value: CallParameterFieldType;
  idx: number;
  functionAbi: AbiFunction | null;
}
interface ICallFunctionSignatureFieldProps {
  functionAbi: AbiFunction | null;
}

export const CallParamField: React.FC<ICallParamFiledProps> = ({ value, idx, functionAbi }) => {
  if (functionAbi?.type !== "function") return;

  const resolvedValue = resolveParamValue(value, functionAbi.inputs?.[idx]);
  const label = resolveFieldTitle(functionAbi.inputs?.[idx].name ?? "", functionAbi.inputs?.[idx].type, idx);

  return (
    <ActionDetailField label={decodeCamelCase(label)} code={true}>
      {resolvedValue}
    </ActionDetailField>
  );
};

export const CallFunctionSignatureField: React.FC<ICallFunctionSignatureFieldProps> = ({ functionAbi }) => {
  if (functionAbi?.type !== "function") return;

  const sig = toFunctionSignature(functionAbi);

  return (
    <ActionDetailField label="Contract function" code={true}>
      {sig}
    </ActionDetailField>
  );
};
