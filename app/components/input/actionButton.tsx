import { forwardRef, type ButtonHTMLAttributes, type ComponentProps } from "react";
import { Button } from "@aragon/ods";
import { ActionLabel } from "@/components/motion/actionLabel";
import { ActionIcon, type ActionIconName } from "./actionIcon";

export type ActionIntent = "open" | "create" | "confirm" | "vote";

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  Pick<ComponentProps<typeof Button>, "isLoading"> & {
    intent?: ActionIntent;
    size?: "regular" | "compact";
    affordance?: ActionIconName;
    align?: "center" | "start";
  };

/** Shared creation, navigation and confirmation actions across governance. */
export const ActionButton = forwardRef<HTMLButtonElement, Props>(function ActionButton(
  { intent = "open", size = "regular", affordance, align = "center", className = "", children, ...props },
  ref
) {
  return (
    <Button
      {...props}
      ref={ref}
      size="lg"
      variant={intent === "open" ? "secondary" : "primary"}
      data-align={align}
      data-size={size}
      className={`ui-action power-action power-action-${intent} ${className}`}
    >
      <span className="ui-action-content">
        <ActionLabel
          icon={affordance ? <ActionIcon name={affordance} /> : undefined}
          iconBehavior={affordance === "check" ? "persistent" : "reveal"}
        >
          {children}
        </ActionLabel>
      </span>
    </Button>
  );
});
