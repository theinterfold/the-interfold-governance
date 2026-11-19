import { forwardRef, useId } from "react";
import { MagnifyingGlass, Wallet, X } from "@phosphor-icons/react";

export const SearchField = forwardRef<
  HTMLInputElement,
  {
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    message?: string;
    invalid?: boolean;
    describedBy?: string;
    kind?: "search" | "address";
    className?: string;
  }
>(({ label, placeholder, value, onChange, message, invalid, describedBy, kind = "search", className = "" }, ref) => {
  const id = useId();
  return (
    <div className={`ui-search-field ${className}`}>
      <label htmlFor={id} className="ui-label">
        {label}
      </label>
      <div className="ui-search-control">
        {kind === "address" ? <Wallet size={16} aria-hidden="true" /> : <MagnifyingGlass size={16} weight="regular" aria-hidden="true" />}
        <input
          ref={ref}
          id={id}
          type={kind === "address" ? "text" : "search"}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy ?? (message ? `${id}-status` : undefined)}
        />
        {value && (
          <button
            type="button"
            aria-label={kind === "address" ? "Clear address" : "Clear search"}
            onClick={() => {
              onChange("");
              document.getElementById(id)?.focus();
            }}
          >
            <X size={16} weight="regular" aria-hidden="true" />
          </button>
        )}
      </div>
      {message && (
        <p id={`${id}-status`} className="power-help" role="status">
          {message}
        </p>
      )}
    </div>
  );
});
SearchField.displayName = "SearchField";
