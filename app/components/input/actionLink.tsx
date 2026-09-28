import Link from "next/link";
import type { ReactNode } from "react";
import { ActionLabel } from "@/components/motion/actionLabel";
import type { ActionIntent } from "./actionButton";
import { ActionIcon, type ActionIconName } from "./actionIcon";

type Props = {
  href: string;
  children: ReactNode;
  intent?: ActionIntent;
  size?: "regular" | "compact";
  affordance?: ActionIconName;
  disabled?: boolean;
  "aria-describedby"?: string;
};

/** Navigation shares the button family's surface, sizing and motion, with native link semantics. */
export function ActionLink({
  href,
  children,
  intent = "open",
  size = "regular",
  affordance,
  disabled,
  "aria-describedby": describedBy,
}: Props) {
  const className = `ui-action power-action power-action-${intent}`;
  const label = (
    <span className="ui-action-content">
      <ActionLabel
        icon={affordance ? <ActionIcon name={affordance} /> : undefined}
        iconBehavior={affordance === "check" || intent === "destructive" ? "persistent" : "reveal"}
      >
        {children}
      </ActionLabel>
    </span>
  );
  return disabled ? (
    <span className={className} data-size={size} role="link" aria-disabled="true" aria-describedby={describedBy}>
      {label}
    </span>
  ) : (
    <Link href={href} className={className} data-size={size} aria-describedby={describedBy}>
      {label}
    </Link>
  );
}
