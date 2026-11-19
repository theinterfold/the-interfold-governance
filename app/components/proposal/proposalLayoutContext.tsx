import { createContext, useContext } from "react";

/** The local review can compare layouts without replacing the mounted ballot. */
export const ProposalLayoutContext = createContext<"original" | "sticky">("sticky");
export const useProposalLayout = () => useContext(ProposalLayoutContext);
