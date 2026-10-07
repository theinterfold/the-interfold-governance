import { forwardRef, useId } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

export const SearchField = forwardRef<
  HTMLInputElement,
  {
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    message?: string;
    className?: string;
  }
>(({ label, placeholder, value, onChange, message, className = "" }, ref) => {
  const id = useId();
  return (
    <div className={`ui-search-field ${className}`}>
      <label htmlFor={id} className="ui-label">
        {label}
      </label>
      <div className="ui-search-control">
        <MagnifyingGlass size={16} weight="regular" aria-hidden="true" />
        <input
          ref={ref}
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={message ? `${id}-status` : undefined}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
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
