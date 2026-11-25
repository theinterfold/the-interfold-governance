import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { ExpandingActionLabel } from "@/components/motion/ExpandingActionLabel";
import styles from "./segmentedControl.module.css";

/** One mutually exclusive choice, with native radio keyboard navigation. */
export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
  size = "default",
  onReselect,
}: {
  label: string;
  value: Value;
  options: readonly {
    value: Value;
    label: string;
    icon?: ReactNode;
    /** Reveal only the trailing phrase, keeping the mode label and icon mounted. */
    reselectSuffix?: string;
  }[];
  onChange: (value: Value) => void;
  size?: "default" | "small";
  /** Repeat an explicit action while keeping its current selection. */
  onReselect?: (value: Value) => void;
}) {
  const name = useId();
  const [hovered, setHovered] = useState<Value>();
  const [focused, setFocused] = useState<Value>();
  const index = options.findIndex((option) => option.value === value);

  return (
    <div
      className={styles.control}
      role="radiogroup"
      aria-label={label}
      data-size={size}
      style={{ "--segments": options.length, "--selected": index } as CSSProperties}
    >
      {index >= 0 && <span className={styles.thumb} aria-hidden="true" />}
      {options.map((option) => (
        <label
          key={option.value}
          className={styles.option}
          data-repeatable={!!onReselect && !!option.reselectSuffix || undefined}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(option.value); }}
          onPointerLeave={() => setHovered(undefined)}
        >
          <input
            className={styles.input}
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            aria-label={option.reselectSuffix ? option.label : undefined}
            aria-description={onReselect && option.value === value && option.reselectSuffix ? `${option.label}${option.reselectSuffix}` : undefined}
            onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setFocused(option.value); }}
            onBlur={() => setFocused(undefined)}
            onChange={() => onChange(option.value)}
            onClick={() => { if (option.value === value) onReselect?.(option.value); }}
          />
          <span className={styles.label}>
            {option.icon && <span className={styles.icon}>{option.icon}</span>}
            {onReselect && option.reselectSuffix ? (
              <ExpandingActionLabel suffix={option.reselectSuffix} expanded={option.value === value && (hovered === option.value || focused === option.value)}>
                {option.label}
              </ExpandingActionLabel>
            ) : <span className={styles.text}>{option.label}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
