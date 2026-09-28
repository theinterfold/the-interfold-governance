import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, getAddress, type Address } from "viem";
import { Button, DialogContent, DialogHeader, DialogRoot, InputText } from "@aragon/ods";
import { If } from "@/components/if";
import { PleaseWaitSpinner } from "@/components/please-wait";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { equalAddresses, formatHexString } from "@/utils/evm";
import { crispSdk } from "../../utils/crispSdk";

/** Rows rendered before the "show more" cut — keeps very large sets responsive. */
const PAGE_SIZE = 100;

interface MaskTargetDialogProps {
  open: boolean;
  onClose: () => void;
  /** The chosen slot, or `undefined` to let the app pick one at random. */
  onPick: (target: Address | undefined) => void;
  e3Id?: bigint;
  /** Left out of the list: a mask on your own slot hides nothing. */
  exclude?: Address;
}

/**
 * Chooses whose slot a mask is written to, from the round's eligible voters.
 *
 * Lists the same CRISP-server census the random pick draws from. It deliberately skips the audit
 * dialog's re-verification (`useEligibleVoters`): that reads historical chain state, and when the
 * read fails it takes the whole list down, leaving nobody to pick. The chain still has the last
 * word — `handleMask` re-reads an ONCHAIN round's weight from the program before proving.
 */
export const MaskTargetDialog = ({ open, onClose, onPick, e3Id, exclude }: MaskTargetDialogProps) => {
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Address>();

  const {
    data: voters,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["crisp-mask-candidates", e3Id?.toString()],
    queryFn: () => crispSdk.getEligibleAddresses(e3Id!),
    enabled: open && e3Id !== undefined,
  });

  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (voters ?? []).filter((v) => !equalAddresses(v.address, exclude) && v.address.toLowerCase().includes(q));
  }, [voters, filter, exclude]);

  // Reset for the next opening, then hand the choice up. `undefined` means "random".
  const pick = (target: Address | undefined) => {
    setSelected(undefined);
    setFilter("");
    setLimit(PAGE_SIZE);
    onPick(target);
  };

  return (
    <DialogRoot open={open} containerClassName="!max-w-[640px]">
      <DialogHeader title="Mask a voter's slot" onCloseClick={onClose} onBackClick={onClose} />
      <DialogContent className="flex flex-col gap-y-4">
        <p className="text-sm text-neutral-500">
          A mask writes an encrypted ballot with zero weight to another voter&apos;s slot, so a written slot no longer
          shows whether its owner voted. Pick whose slot to mask, or let the app choose one at random.
        </p>

        <If true={isLoading}>
          <div className="py-8">
            <PleaseWaitSpinner fullMessage="Loading eligible voters…" />
          </div>
        </If>

        <If true={!!error}>
          <p className="text-sm text-critical-600">Could not load the eligible voters from the CRISP server.</p>
        </If>

        <If true={!!voters && !isLoading}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-neutral-500">
              {candidates.length} eligible {candidates.length === 1 ? "voter" : "voters"}
            </span>
            <InputText
              placeholder="Filter by address…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setLimit(PAGE_SIZE);
              }}
            />
          </div>

          <div className="max-h-[45vh] overflow-y-auto" role="radiogroup" aria-label="Voter to mask">
            {candidates.slice(0, limit).map((voter) => {
              const isSelected = equalAddresses(voter.address, selected);
              return (
                <button
                  key={voter.address}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(getAddress(voter.address))}
                  className={`flex w-full items-center justify-between gap-x-4 border-b border-neutral-100 px-2 py-2 text-left last:border-b-0 ${
                    isSelected ? "bg-neutral-100" : "hover:bg-neutral-50"
                  }`}
                >
                  <span className="flex items-center gap-x-2">
                    <span className="text-sm text-neutral-500">{isSelected ? "●" : "○"}</span>
                    <span className="font-mono text-xs text-neutral-800">{voter.address}</span>
                  </span>
                  <span className="font-mono shrink-0 text-xs text-neutral-500">
                    {/* Served balances are scaled by 10^(decimals-1); one decimal place restores tokens. */}
                    {formatUnits(BigInt(voter.balance), 1)} {PUB_TOKEN_SYMBOL}
                  </span>
                </button>
              );
            })}

            <If true={candidates.length > limit}>
              <div className="py-3 text-center">
                <Button size="sm" variant="tertiary" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                  Show more ({candidates.length - limit} remaining)
                </Button>
              </div>
            </If>

            <If true={!candidates.length}>
              <p className="py-6 text-center text-sm text-neutral-500">No addresses match that filter.</p>
            </If>
          </div>
        </If>

        <div className="flex flex-wrap items-center justify-end gap-3 pb-6 pt-2">
          <Button size="md" variant="tertiary" onClick={() => pick(undefined)}>
            Random voter
          </Button>
          <Button size="md" variant="primary" disabled={!selected} onClick={() => pick(selected)}>
            {selected ? `Mask ${formatHexString(selected)}` : "Select a voter"}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
};
