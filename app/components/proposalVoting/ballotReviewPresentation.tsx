import { createContext, useContext, type ReactNode } from "react";

export type ReviewPowerPresentation = "share" | "inline" | "soft" | "outline" | "column" | "below";

/** Optional review study; the established presentation remains the product default. */
export const BallotReviewPresentationContext = createContext<{ compact: boolean; powerPresentation?: ReviewPowerPresentation; comparison?: ReactNode }>({ compact: false });
export const useBallotReviewPresentation = () => useContext(BallotReviewPresentationContext);
