import type { ReactNode } from "react";

/** Identity, data and action layout for wallet lists, such as the eligible-voter list. */
export function WalletListRow({
  layout = "picker",
  identity,
  children,
}: {
  layout?: "default" | "table" | "picker";
  identity: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={
        layout === "picker"
          ? "delegate-picker-row"
          : layout === "table"
            ? "power-delegate-row"
            : "flex items-center justify-between gap-x-4 border-t border-neutral-100 py-3 first:border-t-0"
      }
    >
      <div className="power-delegate-identity flex min-w-0 items-center gap-x-3">{identity}</div>
      <div className={layout === "table" ? "power-delegate-data" : "delegate-picker-data"}>{children}</div>
    </div>
  );
}
