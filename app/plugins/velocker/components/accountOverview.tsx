import { PanelHeader } from "@/components/panelHeader";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { useEffect, useRef, type ReactNode } from "react";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { FoldBalanceBreakdown } from "./foldBalanceBreakdown";
import type { FoldAllocation } from "../utils/foldAllocation";
import styles from "./accountPanels.module.css";

export function AccountOverview({
  allocation,
  children,
  heading,
}: {
  allocation: FoldAllocation;
  children: ReactNode;
  /** A study can compose the existing heading outside this card. */
  heading?: ReactNode;
}) {
  const allocationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = allocationRef.current;
    const legend = container?.querySelector<HTMLElement>(".fold-allocation-legend");
    if (!container || !legend) return;
    const measure = () => {
      const height = legend.getBoundingClientRect().height;
      if (height > 0) container.style.setProperty("--allocation-diameter", `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(legend);
    return () => observer.disconnect();
  }, [allocation]);
  return (
    <ScrollFadeIn as="section" amount="some" className={`power-card ${styles.accountCard}`} aria-labelledby="account-heading">
      {heading === undefined ? <PanelHeader id="account-heading" title="Your account" /> : heading}
      <div className={styles.overview}>
        <div className={styles.votingSummary}>
          {children}
          <p>From active locks delegated to you, bonded and vesting {PUB_TOKEN_SYMBOL}.</p>
        </div>
        <div ref={allocationRef} className={styles.allocation} aria-label="Balance composition">
          <h3>{PUB_TOKEN_SYMBOL} balance</h3>
          <FoldBalanceBreakdown
            allocation={allocation}
            grouped={true}
            includeVestingInLocked={true}
            interactive={true}
          />
        </div>
      </div>
    </ScrollFadeIn>
  );
}
