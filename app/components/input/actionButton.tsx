import { forwardRef, type ButtonHTMLAttributes, type ComponentProps } from "react";
import { Button } from "@aragon/ods";
import { ActionLabel } from "@/components/motion/actionLabel";
import { ActionIcon, type ActionIconName } from "./actionIcon";

export type ActionIntent = "open" | "create" | "confirm" | "vote" | "destructive";

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  Pick<ComponentProps<typeof Button>, "isLoading"> & {
    intent?: ActionIntent;
    size?: "regular" | "compact" | "small";
    affordance?: ActionIconName;
    appearance?: "default" | "outline" | "text" | "soft";
    iconBehavior?: "reveal" | "persistent";
    align?: "center" | "start";
  };

/** Shared creation, navigation and confirmation actions across governance. */
export const ActionButton = forwardRef<HTMLButtonElement, Props>(function ActionButton(
  { intent = "open", size = "regular", affordance, appearance = "default", iconBehavior, align = "center", className = "", children, ...props },
  ref
) {
  return (
    <Button
      {...props}
      ref={ref}
      size="lg"
      variant={intent === "open" || intent === "destructive" ? "secondary" : "primary"}
      data-align={align}
      data-size={size}
      data-appearance={appearance}
      className={`ui-action power-action power-action-${intent} ${className}`}
    >
      <span className="ui-action-content">
        <ActionLabel
          icon={affordance ? <ActionIcon name={affordance} /> : undefined}
          iconBehavior={iconBehavior ?? (affordance === "check" || intent === "destructive" ? "persistent" : "reveal")}
        >
          {children}
        </ActionLabel>
      </span>
    </Button>
  );
});
