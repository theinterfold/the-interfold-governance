import type { SelectHTMLAttributes } from "react";
import { BendingChevron } from "@/vendor/site-header";

/** Native keyboard/menu behavior with the same chevron inset across the interface. */
export function NativeSelect({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="ui-select-field">
      <select {...props} className={`ui-select ${className}`} />
      <BendingChevron width={8} thickness={1.3} />
    </span>
  );
}
