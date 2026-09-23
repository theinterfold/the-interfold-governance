import type { RawAction } from "@/utils/types";
import { WithdrawalForm } from "@/components/input/withdrawal-form";
import { FunctionAbiSelectForm } from "@/components/input/function-abi-select-form";
import { Button, DialogContent, DialogFooter, DialogHeader, DialogRoot, type IDialogRootProps } from "@aragon/ods";
import { ElseIf, If, Then } from "@/components/if";
import { useState, type RefObject } from "react";
import type { AbiFunction } from "viem";
import { CalldataForm } from "../input/calldata-form";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { ImportActionsForm } from "../input/import-actions-form";

export type NewActionType = "" | "withdrawal" | "select-abi-function" | "calldata" | "import-json";

interface INewActionDialogProps extends IDialogRootProps {
  onClose: (newAction: RawAction[] | null, abi: AbiFunction | null) => void;
  newActionType: NewActionType;
  triggerRef?: RefObject<HTMLButtonElement>;
}

export const NewActionDialog: React.FC<INewActionDialogProps> = (props) => {
  const { onClose, newActionType, triggerRef } = props;
  const [stagedActions, setStagedActions] = useState<RawAction[] | null>(null);
  const [abi, setAbi] = useState<AbiFunction | null>(null);

  const onReceiveAbiAction = (action: RawAction, newAbi: AbiFunction) => {
    setStagedActions([action]);
    setAbi(newAbi);
  };
  const onActionCleared = () => {
    setStagedActions(null);
    setAbi(null);
  };
  const handleSubmit = () => {
    if (!stagedActions?.length) return;

    onClose(stagedActions, abi ?? null);
    setStagedActions(null);
    setAbi(null);
  };
  const dismiss = () => {
    onClose(null, null);
    setStagedActions(null);
    setAbi(null);
  };

  const show = newActionType !== "";

  return (
    <DialogRoot
      open={show}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      containerClassName="interfold-dialog !max-w-[480px]"
      onCloseAutoFocus={(event) => {
        if (triggerRef?.current) {
          event.preventDefault();
          triggerRef.current.focus({ preventScroll: true });
        }
      }}
    >
      <DialogHeader title="Add a new action" onCloseClick={() => dismiss()} onBackClick={() => dismiss()} />
      <DialogContent>
        <FluidHeight>
          <div className="flex flex-col gap-y-4 md:gap-y-6">
            <If val={newActionType} is="withdrawal">
              <Then>
                <WithdrawalForm
                  onChange={(action) => setStagedActions(action ? [action] : null)}
                  onSubmit={() => handleSubmit()}
                />
              </Then>
              <ElseIf val={newActionType} is="select-abi-function">
                <FunctionAbiSelectForm
                  onChange={(action, abi) => onReceiveAbiAction(action, abi)}
                  onActionCleared={onActionCleared}
                />
              </ElseIf>
              <ElseIf val={newActionType} is="calldata">
                <CalldataForm
                  onChange={(action) => setStagedActions(action ? [action] : null)}
                  onSubmit={() => handleSubmit()}
                />
              </ElseIf>
              <ElseIf val={newActionType} is="import-json">
                <ImportActionsForm onChange={(actions) => setStagedActions(actions)} />
              </ElseIf>
            </If>

            <div className="flex justify-between">
              <Button variant="secondary" size="lg" onClick={() => dismiss()}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!stagedActions?.length} size="lg" onClick={() => handleSubmit()}>
                Add action
              </Button>
            </div>
          </div>
        </FluidHeight>
      </DialogContent>
      <DialogFooter />
    </DialogRoot>
  );
};
