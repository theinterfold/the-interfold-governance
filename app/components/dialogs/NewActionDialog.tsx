import type { RawAction } from "@/utils/types";
import { WithdrawalForm } from "@/components/input/withdrawal-form";
import { FunctionAbiSelectForm } from "@/components/input/function-abi-select-form";
import { ActionButton } from "@/components/input/actionButton";
import { ElseIf, If, Then } from "@/components/if";
import { useRef, useState, type RefObject } from "react";
import type { AbiFunction } from "viem";
import { CalldataForm } from "../input/calldata-form";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { ImportActionsForm } from "../input/import-actions-form";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { preparedActionMatchesTarget } from "../input/contractActionState";

export type NewActionType = "" | "withdrawal" | "select-abi-function" | "calldata" | "import-json";

interface INewActionDialogProps {
  onClose: (newAction: RawAction[] | null, abi: AbiFunction | null) => void;
  newActionType: NewActionType;
  triggerRef?: RefObject<HTMLButtonElement>;
}

export const NewActionDialog: React.FC<INewActionDialogProps> = (props) => {
  const { onClose, newActionType, triggerRef } = props;
  const [stagedActions, setStagedActions] = useState<RawAction[] | null>(null);
  const [abi, setAbi] = useState<AbiFunction | null>(null);
  const [contractTarget, setContractTarget] = useState("");
  const [phase, setPhase] = useState("");
  const [session, setSession] = useState(0);
  const lastType = useRef<NewActionType>("");
  const fallbackTrigger = useRef<HTMLElement>(null);
  const show = newActionType !== "";
  if (show) lastType.current = newActionType;
  const renderedType = show ? newActionType : lastType.current;
  const actionReady =
    !!stagedActions?.length &&
    (renderedType !== "select-abi-function" || preparedActionMatchesTarget(stagedActions[0], contractTarget));

  const onReceiveAbiAction = (action: RawAction, newAbi: AbiFunction) => {
    setStagedActions([action]);
    setAbi(newAbi);
  };
  const onActionCleared = () => {
    setStagedActions(null);
    setAbi(null);
  };
  const handleSubmit = () => {
    if (!actionReady || !stagedActions) return;

    onClose(stagedActions, abi ?? null);
  };
  const dismiss = () => {
    onClose(null, null);
  };

  return (
    <ActionTray
      open={show}
      title="Add a new action"
      pending={false}
      triggerRef={triggerRef ?? fallbackTrigger}
      onClose={dismiss}
      onCloseComplete={() => {
        lastType.current = "";
        setStagedActions(null);
        setAbi(null);
        setContractTarget("");
        setSession((value) => value + 1);
        setPhase("");
      }}
      className="proposal-action-tray"
    >
      <FluidHeight layoutKey={`${renderedType}:${phase}`}>
        <div key={session} className="flex flex-col gap-y-4 md:gap-y-6">
          <If val={renderedType} is="withdrawal">
            <Then>
              <WithdrawalForm
                onChange={(action) => setStagedActions(action ? [action] : null)}
                onSubmit={() => handleSubmit()}
              />
            </Then>
            <ElseIf val={renderedType} is="select-abi-function">
              <FunctionAbiSelectForm
                onChange={(action, abi) => onReceiveAbiAction(action, abi)}
                onActionCleared={onActionCleared}
                onTargetChange={setContractTarget}
                onPhaseChange={setPhase}
              />
            </ElseIf>
            <ElseIf val={renderedType} is="calldata">
              <CalldataForm
                onChange={(action) => setStagedActions(action ? [action] : null)}
                onSubmit={() => handleSubmit()}
              />
            </ElseIf>
            <ElseIf val={renderedType} is="import-json">
              <ImportActionsForm onChange={(actions) => setStagedActions(actions)} />
            </ElseIf>
          </If>

          <div className="flex justify-between">
            <ActionButton onClick={() => dismiss()}>Cancel</ActionButton>
            <ActionButton intent="confirm" disabled={!actionReady} onClick={() => handleSubmit()}>
              Add action
            </ActionButton>
          </div>
        </div>
      </FluidHeight>
    </ActionTray>
  );
};
