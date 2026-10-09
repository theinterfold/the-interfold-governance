import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useId, useRef, useState } from "react";
import { BendingChevron } from "@/vendor/site-header";
import { ActionIcon } from "./actionIcon";

/** In-app single-choice menu using the directory's existing menu surface and keyboard behavior. */
export function ChoiceMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <div className="ui-choice-field">
      <span id={id}>{label}</span>
      <DropdownMenu.Root open={open} onOpenChange={(next) => {
        // Keep nested menus inside the dialog's focus boundary, outside its scrolling body.
        if (next) setContainer(trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
        setOpen(next);
      }} modal={false}>
        <DropdownMenu.Trigger asChild>
          <button ref={trigger} type="button" className="ui-choice-trigger" disabled={disabled} aria-labelledby={`${id} ${id}-value`}>
            <span id={`${id}-value`}>{options.find((option) => option.value === value)?.label}</span>
            <BendingChevron open={open} width={8} thickness={1.3} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal container={container}>
          <DropdownMenu.Content
            className="delegate-sort-menu ui-choice-menu"
            align="start"
            sideOffset={6}
            collisionPadding={16}
            aria-label={label}
          >
            <DropdownMenu.RadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
              {options.map((option) => (
                <DropdownMenu.RadioItem className="delegate-sort-option" key={option.value} value={option.value}>
                  {option.label}
                  <DropdownMenu.ItemIndicator className="delegate-sort-check">
                    <ActionIcon name="check" />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
