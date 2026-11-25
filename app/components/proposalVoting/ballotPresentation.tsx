import { createContext, useContext, type ReactNode } from "react";

export type PowerPresentation = "single" | "original" | "paired" | "sentence";
export type ChoiceLayout = "vertical" | "horizontal";

/** Local comparisons reuse the live ballot; switching presentation never resets its draft. */
export const BallotPresentationContext = createContext<{
  power: PowerPresentation;
  choices: ChoiceLayout;
  privacy?: "always" | "after-choice";
}>({ power: "single", choices: "vertical" });
export const useBallotPresentation = () => useContext(BallotPresentationContext);

/** Place the current ballot weight beside its snapshot total, before eligibility notices. */
export const BallotPowerPreviewContext = createContext<
  ((snapshot: string, info: ReactNode, warning?: ReactNode) => ReactNode) | null
>(null);
