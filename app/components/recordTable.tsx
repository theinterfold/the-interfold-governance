import { createContext, useContext, type ReactNode } from "react";
import { ScrollFadeIn } from "@/vendor/site-header/motion";

export const RecordTableContext = createContext({ embedded: false, presentation: true });
export const useRecordTable = () => useContext(RecordTableContext);

/** Shared account records: one entrance and surface, with adaptive column guides. */
export function RecordTable({ kind, heading, children, enabled = true, animate = true, className = "" }: {
  kind: "locks" | "delegations"; heading?: ReactNode; children: ReactNode;
  enabled?: boolean; animate?: boolean; className?: string;
}) {
  if (!enabled) return <>{heading}{children}</>;
  const Frame = animate ? ScrollFadeIn : "div";
  return <RecordTableContext.Provider value={{embedded: true, presentation: true}}>
    <Frame {...(animate ? {amount: "some" as const} : {})} data-record-table={kind} className={className}>
      {heading}
      <div data-record-collection={true}>
        <div data-record-columns={kind} aria-hidden="true">
          {(kind === "locks" ? ["Lock", "Amount", "Status", "Action"] : ["Wallet", "Power", "Status", "Action"]).map(label => <span key={label}>{label}</span>)}
        </div>
        {children}
      </div>
    </Frame>
  </RecordTableContext.Provider>;
}
