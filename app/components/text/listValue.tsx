import type { ReactNode } from "react";

/** Shared list typography; IDs and ranks retain their different meanings. */
export function RowIdentifier({ children }: { children: ReactNode }) {
  return <span className="ui-row-identifier">{children}</span>;
}

export function ListTokenAmount({ value, symbol }: { value: ReactNode; symbol: string }) {
  return (
    <span className="ui-list-token-amount">
      <span>{value}</span>
      <span className="power-position-unit">{symbol}</span>
    </span>
  );
}
