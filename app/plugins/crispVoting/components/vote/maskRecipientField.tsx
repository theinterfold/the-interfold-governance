import { useId, useRef, useState, type ReactNode } from "react";
import { BendingChevron } from "@/vendor/site-header";
import { ActionTray } from "@/plugins/velocker/components/actionTray";
import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { MaskRecipientPicker, RecipientIdentity } from "./maskRecipientPicker";
import type { CreditsMode, EligibleVoter } from "../../utils/types";

export type MaskTargetMode = "random" | "address";

/**
 * The recipient of one mask: a random eligible voter, or a wallet chosen from the census. The
 * "Add a mask" tool and each mask in the mask list use it.
 */
export function MaskRecipientField({
  label = "Mask recipient",
  mode,
  target,
  onChange,
  recipients,
  recipientError,
  onRetry,
  pending,
  creditMode,
  e3Id,
  children,
  invalidMessage,
  showAvailabilityStatus = true,
}: {
  label?: string;
  mode: MaskTargetMode;
  target: string;
  onChange: (selection: { mode: MaskTargetMode; target: string }) => void;
  recipients?: EligibleVoter[];
  recipientError: boolean;
  onRetry: () => void;
  pending: boolean;
  creditMode?: CreditsMode;
  e3Id?: bigint;
  /** Shown below the recipient. */
  children?: ReactNode;
  invalidMessage?: string;
  /** A queue presents the shared census status once above its recipients. */
  showAvailabilityStatus?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pickerSession, setPickerSession] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selected = mode === "address" && !!target;
  return (
    <div className="ballot-mask-target">
      <div className="ui-choice-field">
        <span id={id}>{label}</span>
        <button
          ref={trigger}
          type="button"
          className="ui-choice-trigger"
          disabled={pending}
          aria-labelledby={`${id} ${id}-value`}
          aria-invalid={!!invalidMessage || undefined}
          aria-describedby={invalidMessage ? `${id}-error` : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setPickerSession((session) => session + 1); setOpen(true); }}
        >
          <span id={`${id}-value`}>
            {selected ? <RecipientIdentity address={target} /> : mode === "random" ? "Random eligible voter" : "Choose a wallet"}
          </span>
          <BendingChevron open={open} width={8} thickness={1.3} />
        </button>
      </div>
      {invalidMessage && <p id={`${id}-error`} className="vp-submission-error" role="alert">{invalidMessage}</p>}
      {showAvailabilityStatus && <MaskRecipientAvailability recipients={recipients} recipientError={recipientError} onRetry={onRetry} />}
      <ActionTray
        open={open}
        title={label}
        pending={pending}
        triggerRef={trigger}
        initialFocusRef={search}
        onClose={() => setOpen(false)}
      >
        {recipientError && (
          <div role="alert">
            <p className="vp-submission-error">Could not load the eligible voters from the CRISP server.</p>
            <PowerAction size="compact" onClick={onRetry}>Try again</PowerAction>
          </div>
        )}
        <MaskRecipientPicker
          key={pickerSession}
          voters={recipients}
          loading={!recipients && !recipientError}
          selected={mode === "address" ? target : ""}
          random={mode === "random"}
          pending={pending}
          creditMode={creditMode}
          e3Id={e3Id}
          searchRef={search}
          onSelectRandom={() => {
            onChange({ mode: "random", target });
            setOpen(false);
          }}
          onSelect={(address) => {
            onChange({ mode: "address", target: address });
            setOpen(false);
          }}
        />
      </ActionTray>
      {children}
    </div>
  );
}

/** Census availability belongs to the whole list, not to each individual wallet. */
export function MaskRecipientAvailability({ recipients, recipientError, onRetry }: {
  recipients?: EligibleVoter[];
  recipientError: boolean;
  onRetry: () => void;
}) {
  if (!recipientError && recipients?.length) return null;
  return <div className="ballot-mask-address" aria-live="polite">
    {recipientError ? <>
      <p className="vp-submission-error" role="alert">Could not load eligible voters. Try again before reviewing your masks.</p>
      <button type="button" className="vp-retry-mask" onClick={onRetry}>Try again</button>
    </> : !recipients ? <span>Loading eligible voters…</span>
      : <p className="vp-submission-error" role="alert">No eligible voters are available for this proposal.</p>}
  </div>;
}
