import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Disclosure } from "@/components/motion/Disclosure";
import { BendingChevron } from "@/vendor/site-header";
import { PanelHeader } from "@/components/panelHeader";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PUB_TOKEN_SYMBOL } from "@/constants";
import { FoldBalanceBreakdown } from "./foldBalanceBreakdown";
import type { FoldAllocation } from "../utils/foldAllocation";
import styles from "./accountPanels.module.css";

export function AccountOverview({
  allocation,
  children,
  heading,
  balanceText,
}: {
  allocation: FoldAllocation;
  children: ReactNode;
  /** A study can compose the existing heading outside this card. */
  heading?: ReactNode;
  balanceText?: string;
}) {
  const mobile = useMediaQuery("(max-width: 600px)");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const breakdownId = useId();
  const collapsible = mobile && allocation.status === "ready" && !!balanceText;
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
          <p>Voting power available to this wallet, including power you represent.</p>
        </div>
        <div ref={allocationRef} className={styles.allocation} aria-label="Balance composition">
          {collapsible ? <h3 className={styles.disclosureHeading}>
            <button type="button" aria-expanded={showBreakdown} aria-controls={breakdownId}
              onClick={() => setShowBreakdown(open => !open)}>
              <span>{PUB_TOKEN_SYMBOL} balance</span><span>{balanceText} {PUB_TOKEN_SYMBOL}</span><BendingChevron open={showBreakdown} />
            </button>
          </h3> : <h3>{PUB_TOKEN_SYMBOL} balance</h3>}
          <Disclosure id={breakdownId} open={!collapsible || showBreakdown}>
            <FoldBalanceBreakdown allocation={allocation} grouped interactive />
          </Disclosure>
        </div>
      </div>
    </ScrollFadeIn>
  );
}
