import { PowerAction } from "@/plugins/velocker/components/powerAction";
import { MaskRecipientField, type MaskTargetMode } from "./maskRecipientField";
import type { CreditsMode, EligibleVoter } from "../../utils/types";

/** One mask in the list: its recipient mode and, for a chosen wallet, the address. */
export type MaskEntry = { id: number; mode: MaskTargetMode; target: string };

/** The masks to send on their own. Each has its own recipient, and the list has no limit. */
export function MaskQueue({
  entries,
  onChange,
  onAdd,
  recipients,
  recipientError,
  onRetry,
  pending,
  creditMode,
  e3Id,
}: {
  entries: MaskEntry[];
  onChange: (entries: MaskEntry[]) => void;
  onAdd: () => void;
  recipients?: EligibleVoter[];
  recipientError: boolean;
  onRetry: () => void;
  pending: boolean;
  creditMode?: CreditsMode;
  e3Id?: bigint;
}) {
  const update = (id: number, change: Partial<MaskEntry>) =>
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)));

  return (
    <div className="mask-queue">
      <ol className="mask-queue-list" aria-label="Masks to send">
        {entries.map((entry, index) => (
          <li key={entry.id} className="mask-queue-entry">
            <MaskRecipientField
              label={entries.length > 1 ? `Mask ${index + 1} recipient` : "Mask recipient"}
              mode={entry.mode}
              onModeChange={(mode) => update(entry.id, { mode })}
              target={entry.target}
              onTargetChange={(target) => update(entry.id, { target })}
              recipients={recipients}
              recipientError={recipientError}
              onRetry={onRetry}
              pending={pending}
              creditMode={creditMode}
              e3Id={e3Id}
            />
            {entries.length > 1 && (
              <button
                type="button"
                className="vp-foot-note vp-mode-toggle mask-queue-remove"
                disabled={pending}
                onClick={() => onChange(entries.filter((other) => other.id !== entry.id))}
              >
                Remove mask {index + 1}
              </button>
            )}
          </li>
        ))}
      </ol>
      <PowerAction size="compact" affordance="plus" disabled={pending} onClick={onAdd}>
        Add another mask
      </PowerAction>
    </div>
  );
}
