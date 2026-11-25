import { useRef } from "react";
import { ActionIcon } from "@/components/input/actionIcon";
import { MaskRecipientField, MaskRecipientAvailability, type MaskTargetMode } from "./maskRecipientField";
import type { CreditsMode, EligibleVoter } from "../../utils/types";

/** One mask in the list: its recipient mode and, for a chosen wallet, the address. */
export type MaskEntry = { id: number; mode: MaskTargetMode; target: string };

/** Each mask stays visible with its own recipient selector and remove action. */
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
  review = false,
  isInvalid,
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
  review?: boolean;
  isInvalid?: (entry: MaskEntry) => boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const update = (entryId: number, change: Partial<MaskEntry>) =>
    onChange(entries.map((entry) => (entry.id === entryId ? { ...entry, ...change } : entry)));

  return (
    <div className="mask-queue">
      <MaskRecipientAvailability recipients={recipients} recipientError={recipientError} onRetry={onRetry} />
      <span className="sr-only" role="status">{entries.length} {entries.length === 1 ? "mask" : "masks"} to send</span>
      <ol ref={list} className="mask-queue-list" aria-label="Masks to send">
        {entries.map((entry, index) => (
          <li key={entry.id} className="mask-queue-entry">
            <MaskRecipientField
              showAvailabilityStatus={false}
              invalidMessage={entry.mode === "address" && !!recipients?.length && !recipientError && isInvalid?.(entry) ? entry.target ? "This wallet is not eligible. Choose another wallet." : "Choose a wallet for this mask." : undefined}
              label={entries.length > 1 ? `Mask ${index + 1} recipient` : "Mask recipient"}
              mode={entry.mode}
              target={entry.target}
              onChange={(selection) => update(entry.id, selection)}
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
                className="ui-text-action mask-queue-remove"
                aria-label={`Remove mask ${index + 1}`}
                title={`Remove mask ${index + 1}`}
                disabled={pending}
                onClick={() => {
                  const rows = Array.from(list.current?.querySelectorAll<HTMLLIElement>(".mask-queue-entry") ?? []);
                  const rowIndex = rows.findIndex(row => row.contains(document.activeElement));
                  const next = rows[rowIndex + 1] ?? rows[rowIndex - 1];
                  (next?.querySelector<HTMLButtonElement>(".ui-choice-trigger") ?? addButton.current)?.focus();
                  onChange(entries.filter((other) => other.id !== entry.id));
                }}
              >
                <ActionIcon name="close" />
              </button>
            )}
          </li>
        ))}
      </ol>
      {!review && <button ref={addButton} type="button" className="ui-text-action mask-queue-add" disabled={pending} onClick={onAdd}>
        <ActionIcon name="plus" />
        Add mask
      </button>}
    </div>
  );
}
