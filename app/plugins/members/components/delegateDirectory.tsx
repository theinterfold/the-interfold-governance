import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import type { Address } from "viem";
import { DelegateList } from "./delegateList";
import type { DelegateOrder } from "../utils/delegateOrder";
import { SearchField } from "@/components/input/searchField";
import { useDelegateSearch } from "../hooks/useDelegateSearch";

const sortOptions: { value: DelegateOrder; label: string }[] = [
  { value: "power-desc", label: "Highest voting power" },
  { value: "power-asc", label: "Lowest voting power" },
  { value: "newest", label: "Newest delegates" },
];

export function DelegateDirectory({
  refreshKey = 0,
  onSelect,
  pending = false,
}: {
  refreshKey?: number;
  onSelect?: (address: Address) => void;
  pending?: boolean;
}) {
  const [order, setOrder] = useState<DelegateOrder>("power-desc");
  const [search, setSearch] = useState("");
  const lookup = useDelegateSearch(search);
  const sortLabel = sortOptions.find((option) => option.value === order)?.label ?? sortOptions[0].label;
  return (
    <section className="delegate-directory" aria-label="Delegates">
      <SearchField
        label="Search delegates"
        placeholder="ENS name or wallet address"
        value={search}
        onChange={setSearch}
        message={lookup.message}
      />
      <div className="power-delegate-head ui-table-head">
        <h3 className="power-delegate-identity-heading">Delegates</h3>
        <div className="power-delegate-data">
          <span className="power-delegate-power-heading ui-number">Voting power</span>
          <div className="power-delegate-sort">
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild={true}>
                <button type="button" className="delegate-sort" aria-label={`Sort delegates: ${sortLabel}`}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 15V4m-3 3 3-3 3 3M14 5v11m-3-3 3 3 3-3" />
                  </svg>
                  <span>{sortLabel}</span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="delegate-sort-menu"
                  align="end"
                  sideOffset={8}
                  collisionPadding={16}
                  aria-label="Sort delegates"
                >
                  <DropdownMenu.RadioGroup value={order} onValueChange={(value) => setOrder(value as DelegateOrder)}>
                    {sortOptions.map((option) => (
                      <DropdownMenu.RadioItem key={option.value} value={option.value} className="delegate-sort-option">
                        {option.label}
                        <DropdownMenu.ItemIndicator className="delegate-sort-check">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="m4 10 4 4 8-8" />
                          </svg>
                        </DropdownMenu.ItemIndicator>
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
      <DelegateList
        layout="table"
        refreshKey={refreshKey}
        onSelect={onSelect}
        pending={pending}
        order={order}
        search={search}
        lookup={lookup}
      />
    </section>
  );
}
