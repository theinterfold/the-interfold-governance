import { useId, type CSSProperties, type ReactNode } from "react";
import styles from "./segmentedControl.module.css";

/** One mutually exclusive choice, with native radio keyboard navigation. */
export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string; icon?: ReactNode }[];
  onChange: (value: Value) => void;
}) {
  const name = useId();
  const index = options.findIndex((option) => option.value === value);

  return (
    <div
      className={styles.control}
      role="radiogroup"
      aria-label={label}
      style={{ "--segments": options.length, "--selected": index } as CSSProperties}
    >
      {index >= 0 && <span className={styles.thumb} aria-hidden="true" />}
      {options.map((option) => (
        <label key={option.value} className={styles.option}>
          <input
            className={styles.input}
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span className={styles.label}>
            {option.icon && <span className={styles.icon}>{option.icon}</span>}
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
