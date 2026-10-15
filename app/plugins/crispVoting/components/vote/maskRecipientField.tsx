import type { ReactNode } from "react";
import { ChoiceMenu } from "@/components/input/choiceMenu";
import { FluidHeight } from "@/components/motion/FluidHeight";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { MaskRecipientPicker } from "./maskRecipientPicker";
import type { CreditsMode, EligibleVoter } from "../../utils/types";

export type MaskTargetMode = "random" | "address";

/**
 * The recipient of one mask: a random eligible voter, or a wallet chosen from the census. The
 * "Add a mask" tool and each mask in the mask list use it.
 */
export function MaskRecipientField({
  label = "Mask recipient",
  mode,
  onModeChange,
  target,
  onTargetChange,
  recipients,
  recipientError,
  onRetry,
  pending,
  creditMode,
  e3Id,
  children,
}: {
  label?: string;
  mode: MaskTargetMode;
  onModeChange: (mode: MaskTargetMode) => void;
  target: string;
  onTargetChange: (address: string) => void;
  recipients?: EligibleVoter[];
  recipientError: boolean;
  onRetry: () => void;
  pending: boolean;
  creditMode?: CreditsMode;
  e3Id?: bigint;
  /** Shown below the recipient. */
  children?: ReactNode;
}) {
  return (
    <div className="ballot-mask-target">
      <ChoiceMenu
        label={label}
        value={mode}
        onChange={onModeChange}
        disabled={pending}
        options={[
          { value: "random", label: "Random eligible voter" },
          { value: "address", label: "Specific wallet" },
        ]}
      />
      <FluidHeight>
        <div className="motion-tab-panels">
          <MotionPanel active={mode === "random"} direction="left">
            {(recipientError || !recipients || !recipients.length) && (
              <div className="ballot-mask-address" aria-live="polite">
                {recipientError ? (
                  <>
                    <p className="vp-submission-error" role="alert">
                      Could not load the eligible voters from the CRISP server.
                    </p>
                    <button type="button" className="vp-retry-mask" onClick={onRetry}>
                      Try again
                    </button>
                  </>
                ) : !recipients ? (
                  <span>Choosing an eligible voter…</span>
                ) : (
                  <p className="vp-submission-error" role="alert">
                    No eligible voters are available for this proposal.
                  </p>
                )}
              </div>
            )}
          </MotionPanel>
          <MotionPanel active={mode === "address"} direction="right">
            {recipientError && (
              <div role="alert">
                <p className="vp-submission-error">Could not load the eligible voters from the CRISP server.</p>
                <PowerAction size="compact" onClick={onRetry}>
                  Try again
                </PowerAction>
              </div>
            )}
            <MaskRecipientPicker
              voters={recipients}
              loading={!recipients && !recipientError}
              selected={target}
              pending={pending}
              creditMode={creditMode}
              e3Id={e3Id}
              onSelect={onTargetChange}
            />
          </MotionPanel>
        </div>
      </FluidHeight>
      {children}
    </div>
  );
}
