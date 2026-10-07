import { type FC, useEffect, useRef, useState } from "react";
import { toFunctionSignature, type AbiFunction, type Address, type Hex } from "viem";
import { AlertInline, InputContainer, InputText } from "@aragon/ods";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { isAddress } from "@/utils/evm";
import { type RawAction } from "@/utils/types";
import { If } from "@/components/if";
import { useAbi } from "@/hooks/useAbi";
import { FunctionParamsForm } from "./function-params-form";
import { AddressText } from "../text/address";
import { decodeCamelCase } from "@/utils/case";
import { functionBelongsToAbi } from "./contractActionState";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { DESIGN_PREVIEW } from "@/dev/previewMode";
import { DEMO_CONTRACT_A, DEMO_CONTRACT_B } from "@/dev/contractActionFixtures";

interface FunctionAbiSelectFormProps {
  onChange: (action: RawAction, abi: AbiFunction) => any;
  onActionCleared: () => any;
  onTargetChange: (address: string) => void;
  onPhaseChange?: (phase: string) => void;
}
export const FunctionAbiSelectForm: FC<FunctionAbiSelectFormProps> = ({
  onChange,
  onActionCleared,
  onTargetChange,
  onPhaseChange,
}) => {
  const [targetContract, setTargetContract] = useState<string>("");
  const { abi, isLoading: loadingAbi, isProxy, implementation } = useAbi(targetContract as Address);
  const [selectedFunctionAbi, setSelectedFunctionAbi] = useState<AbiFunction | undefined>();
  const returnToFunctionList = useRef(false);
  const revision = useRef(0);
  const lastSelectedFunction = useRef<AbiFunction>();
  if (selectedFunctionAbi) lastSelectedFunction.current = selectedFunctionAbi;

  const phase = loadingAbi
    ? "loading"
    : !targetContract
      ? "empty"
      : !isAddress(targetContract)
        ? "invalid"
        : !abi?.length
          ? "missing"
          : selectedFunctionAbi
            ? "parameters"
            : "choose";
  useEffect(() => onPhaseChange?.(phase), [phase, onPhaseChange]);

  const functionAbiList = (abi || []).filter((item) => {
    if (["function"].includes(item.type)) return true;
    else if (["payable", "nonpayable"].includes(item.stateMutability)) return true;
    return false;
  });
  const currentRevision = revision.current;

  const onActionChanged = (data: Hex, value: bigint) => {
    if (
      currentRevision !== revision.current ||
      !isAddress(targetContract) ||
      !selectedFunctionAbi ||
      !functionBelongsToAbi(selectedFunctionAbi, functionAbiList)
    )
      return;

    onChange(
      {
        to: targetContract as Address,
        value,
        data,
      },
      selectedFunctionAbi
    );
  };

  const changeTarget = (nextAddress: string) => {
    if (nextAddress === targetContract) return;
    // Prepared calldata is valid only for the address and ABI that produced it.
    revision.current++;
    returnToFunctionList.current = false;
    onActionCleared();
    setSelectedFunctionAbi(undefined);
    setTargetContract(nextAddress);
    onTargetChange(nextAddress);
  };

  return (
    <div className="mt-4">
      <div className="mb-3">
        <InputText
          label="Contract address"
          placeholder="0x1234..."
          variant={!targetContract || isAddress(targetContract) ? "default" : "critical"}
          value={targetContract}
          onChange={(e) => changeTarget(e.target.value || "")}
        />
      </div>
      {DESIGN_PREVIEW && (
        <div className="mb-4 text-xs text-neutral-500">
          <p>Demo contracts for testing calls. Copy an address or use it here:</p>
          {[
            ["A", DEMO_CONTRACT_A],
            ["B", DEMO_CONTRACT_B],
          ].map(([name, address]) => (
            <div key={name} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{name}</span>
              <code className="select-all break-all">{address}</code>
              <button type="button" className="underline" onClick={() => void navigator.clipboard?.writeText(address)}>
                Copy {name}
              </button>
              <button type="button" className="underline" onClick={() => changeTarget(address)}>
                Use {name}
              </button>
            </div>
          ))}
        </div>
      )}
      {/* One panel family shares the dialog's single FluidHeight owner. */}
      <div className="motion-tab-panels">
        <MotionPanel active={phase === "loading"} direction="left">
          <PleaseWaitSpinner />
        </MotionPanel>
        <MotionPanel active={phase === "empty"} direction="left">
          <p>Enter the address of the contract to call in a new action</p>
        </MotionPanel>
        <MotionPanel active={phase === "invalid"} direction="left">
          <AlertInline message="The given address is not valid" variant="critical" />
        </MotionPanel>
        <MotionPanel active={phase === "missing"} direction="left">
          <AlertInline
            message="Cannot find the public interface for the given address. Check that the address is a contract with a public ABI and that the contract exposes functions to be called."
            variant="critical"
          />
        </MotionPanel>
        <MotionPanel active={phase === "choose"} direction="left">
          <If true={isProxy}>
            <p className="mb-6 text-sm opacity-80">
              The given contract is a proxy of <AddressText>{implementation}</AddressText>
            </p>
          </If>
          <FunctionSelect
            functionAbiList={functionAbiList}
            active={phase === "choose"}
            focusFirst={returnToFunctionList.current}
            onSelect={(functionAbi) => {
              revision.current++;
              returnToFunctionList.current = false;
              onActionCleared();
              setSelectedFunctionAbi(functionAbi);
            }}
          />
        </MotionPanel>
        <MotionPanel active={phase === "parameters"} direction="right">
          <If true={isProxy}>
            <p className="mb-6 text-sm opacity-80">
              The given contract is a proxy of <AddressText>{implementation}</AddressText>
            </p>
          </If>
          <FunctionSelectorChange
            selectedFunctionAbi={selectedFunctionAbi ?? lastSelectedFunction.current}
            active={phase === "parameters"}
            onClean={() => {
              revision.current++;
              returnToFunctionList.current = true;
              onActionCleared();
              setSelectedFunctionAbi(undefined);
            }}
          />
          <FunctionParamsForm
            key={lastSelectedFunction.current ? toFunctionSignature(lastSelectedFunction.current) : "no-function"}
            functionAbi={lastSelectedFunction.current}
            active={phase === "parameters"}
            selectionRevision={revision.current}
            onActionChanged={(calldata, value) => onActionChanged(calldata, value)}
            onActionCleared={() => onActionCleared()}
          />
        </MotionPanel>
      </div>
    </div>
  );
};

const FunctionSelectorChange = ({
  selectedFunctionAbi,
  active,
  onClean,
}: {
  selectedFunctionAbi?: AbiFunction;
  active: boolean;
  onClean: () => any;
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active || !selectedFunctionAbi) return;
    return focusAfterPanelEnters(() => buttonRef.current);
  }, [active, selectedFunctionAbi]);
  if (!selectedFunctionAbi) return <></>;

  return (
    <InputContainer id="func-abi-select" label="Function" className="my-4">
      <button ref={buttonRef} type="button" className="w-full cursor-pointer p-4 text-left text-sm" onClick={onClean}>
        <code className="line-clamp-1 text-ellipsis">
          {selectedFunctionAbi ? toFunctionSignature(selectedFunctionAbi) : ""}
        </code>
        <span className="sr-only">. Choose another function</span>
      </button>
    </InputContainer>
  );
};

const FunctionSelect = ({
  functionAbiList,
  active,
  focusFirst,
  onSelect,
}: {
  functionAbiList: AbiFunction[];
  active: boolean;
  focusFirst: boolean;
  onSelect: (f: AbiFunction) => any;
}) => {
  const [showReadOnly, setShowReadOnly] = useState(false);
  const listRef = useRef<HTMLDListElement>(null);
  const readonlyCount = functionAbiList.filter((f) => ["pure", "view"].includes(f.stateMutability)).length;
  useEffect(() => {
    if (!active || !focusFirst) return;
    return focusAfterPanelEnters(() => listRef.current?.querySelector<HTMLButtonElement>("button"));
  }, [active, focusFirst]);

  return (
    <InputContainer id="func-abi-select" label="Select the function to call" className="my-4">
      <dl ref={listRef} className="w-full divide-y divide-neutral-100">
        {functionAbiList.map((func, idx) => (
          <If true={!["pure", "view"].includes(func.stateMutability) || showReadOnly} key={idx}>
            <dd>
              <button
                type="button"
                onClick={() => onSelect(func)}
                className="flex w-full cursor-pointer flex-col items-baseline gap-y-2 px-3 py-3 text-left text-base leading-tight text-neutral-500 first:rounded-t-xl last:rounded-b-xl hover:bg-neutral-50 lg:gap-x-6 lg:py-4"
              >
                {decodeCamelCase(func.name)}
                <If true={["pure", "view"].includes(func.stateMutability)}>
                  {" "}
                  <span className="text-xs text-neutral-300">(read only)</span>
                </If>
              </button>
            </dd>
          </If>
        ))}
        <If true={!showReadOnly && readonlyCount > 0}>
          <dd>
            <button
              type="button"
              onClick={() => setShowReadOnly(true)}
              className="flex w-full cursor-pointer flex-col items-baseline gap-y-2 px-3 py-3 text-left text-sm leading-tight text-neutral-300 first:rounded-t-xl last:rounded-b-xl hover:bg-neutral-50 lg:gap-x-6 lg:py-4"
            >
              Show read only methods ({readonlyCount})
            </button>
          </dd>
        </If>
      </dl>
    </InputContainer>
  );
};

function focusAfterPanelEnters(getTarget: () => HTMLElement | null | undefined) {
  let frame = 0;
  let attempts = 0;
  const tryFocus = () => {
    const target = getTarget();
    const panel = target?.closest<HTMLElement>(".motion-tab-panel");
    // A reversal changes data-state before this callback; the effect cleanup
    // also cancels its frame. Never focus an outgoing panel.
    if (!target?.isConnected || panel?.dataset.state !== "active") return;
    const current = document.activeElement;
    if (
      current === target ||
      (current !== document.body && !current?.closest('.motion-tab-panel[data-state="inactive"]'))
    )
      return;
    if (
      !target.closest("[inert]") &&
      target.getClientRects().length > 0 &&
      getComputedStyle(target).visibility === "visible"
    ) {
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
    // CSS visibility and the dialog's focus scope can settle after the first
    // frame. Retry only during the short entrance, then give up quietly.
    if (++attempts < 30) frame = requestAnimationFrame(tryFocus);
  };
  frame = requestAnimationFrame(tryFocus);
  return () => cancelAnimationFrame(frame);
}
