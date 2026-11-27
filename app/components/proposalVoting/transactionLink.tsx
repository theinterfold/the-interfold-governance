import { Receipt } from "@phosphor-icons/react";
import { useState } from "react";
import { HoverArrowContent } from "@/vendor/site-header/motion";

/** The same receipt action for the live explorer and local demo receipts. */
export function TransactionLink({ href, label = "View transaction", ariaLabel }: { href: string; label?: string; ariaLabel: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  return <a className="ui-text-action ui-transaction-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${ariaLabel} (opens in a new tab)`} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}>
    <HoverArrowContent isExternal isHovered={isHovered || isFocused} textClassName="ui-transaction-label" arrowClassName="ui-transaction-external" arrowGap={4} align="start">
      <Receipt size={18} weight="regular" aria-hidden="true"/>
      <span className="ui-transaction-text">{label}</span>
    </HoverArrowContent>
  </a>;
}
