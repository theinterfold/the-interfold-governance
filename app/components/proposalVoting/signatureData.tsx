import { forwardRef, type ButtonHTMLAttributes } from "react";
import { CodeBlock, Eye } from "@phosphor-icons/react";
import styles from "./signatureData.module.css";

/** Opens the data a wallet will ask the voter to sign, from the ballot review. */
export const SignatureDataEntry = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { network: string }
>(function SignatureDataEntry({ network, className = "", ...props }, ref) {
  return (
    <button {...props} ref={ref} type="button" className={`${styles.entry} ${className}`}>
      <CodeBlock size={18} weight="regular" aria-hidden="true" />
      <span className={styles.copy}>
        <span className={styles.label}>Signature data</span>
        <span className={styles.meta}>
          EIP-712<span className={styles.network}> · {network}</span>
        </span>
      </span>
      <span className={styles.view}>View</span>
      <Eye size={18} weight="regular" aria-hidden="true" />
    </button>
  );
});

/**
 * The typed data a wallet signs, in full, with a plain-language note for each signed field. It uses
 * the scroll of the surface that contains it. `BallotReview` moves focus to it by its label.
 */
export function SignatureData({
  request,
  notes,
  pending,
}: {
  /** The request exactly as the wallet receives it. An undefined field is not known before signing. */
  request: object;
  notes: { field: string; note: string }[];
  /** Shown in place of a field that is not known before signing. */
  pending: string;
}) {
  const json = JSON.stringify(
    request,
    (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value === undefined ? pending : value),
    2
  );
  return (
    <div className={styles.data} role="region" aria-label="Signature data" tabIndex={0}>
      <pre>
        <code>{json}</code>
      </pre>
      <dl className={styles.notes}>
        {notes.map(({ field, note }) => (
          <div key={field}>
            <dt>{field}</dt>
            <dd>{note}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
